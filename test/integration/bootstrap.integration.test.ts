/**
 * Runs against a throwaway Postgres, which is the only way to test any of
 * this: the bootstrap gate is the one piece of the deploy that can leave a
 * half-migrated database serving traffic, and none of its behaviour exists
 * outside a real server. Skipped when DATABASE_URL is unset, so
 * `npm test` stays a pure, database-free gate.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MIGRATIONS = readdirSync(`${ROOT}/drizzle`).filter((f) => f.endsWith('.sql'));

/** Returns the exit status and output instead of throwing, because a
 *  failed bootstrap is the thing under test half the time. */
function bootstrap() {
	try {
		const stdout = execFileSync('node', ['scripts/bootstrap.js'], {
			cwd: ROOT,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		return { code: 0, out: stdout };
	} catch (err) {
		const e = err as { status: number; stdout: string; stderr: string };
		return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
	}
}

describe('database bootstrap', { skip: url ? false : 'DATABASE_URL is not set' }, () => {
	let sql: ReturnType<typeof postgres>;

	before(() => {
		sql = postgres(url!, { max: 2, onnotice: () => {} });
	});
	after(async () => {
		await sql.end({ timeout: 5 });
	});

	test('an empty database comes up fully migrated', async () => {
		const run = bootstrap();
		assert.equal(run.code, 0, run.out);

		const ext = await sql`select extname from pg_extension`;
		const names = ext.map((r) => r.extname);
		for (const needed of ['pgcrypto', 'citext', 'cube', 'earthdistance', 'pg_trgm'])
			assert.ok(names.includes(needed), `extension ${needed} is missing`);

		const [{ count }] = await sql`select count(*)::int as count from _migrations`;
		assert.equal(count, MIGRATIONS.length, 'not every migration in drizzle/ ran');

		const [{ ok }] = await sql`select to_regclass('public.ad_live') is not null as ok`;
		assert.ok(ok, 'ad_live view was not created');
	});

	test('reference data lands, and a second run does not double it', async () => {
		const [before] = await sql`select count(*)::int as n from instrument`;
		assert.ok(before.n > 0, 'no instruments were loaded');

		const run = bootstrap();
		assert.equal(run.code, 0, run.out);

		const [after] = await sql`select count(*)::int as n from instrument`;
		const [countries] = await sql`select count(*)::int as n from country`;
		assert.equal(after.n, before.n, 'reference data was inserted twice');
		assert.equal(countries.n, 194);
	});

	test('editing a migration that already ran stops the deploy', async () => {
		// The guard that matters most: silently skipping an edited migration
		// means the database no longer matches the code that reads it.
		const name = MIGRATIONS[0];
		const [row] = await sql`select checksum from _migrations where name = ${name}`;
		await sql`update _migrations set checksum = 'tampered' where name = ${name}`;
		try {
			const run = bootstrap();
			assert.notEqual(run.code, 0, 'bootstrap carried on over edited history');
			assert.match(run.out, /has changed since it was applied/);
		} finally {
			await sql`update _migrations set checksum = ${row.checksum} where name = ${name}`;
		}
	});

	test('ad_live hides an ad until it is published, and again once it expires', async () => {
		const publicId = `t${Date.now().toString(36)}`.slice(0, 6);
		const inView = async () =>
			(await sql`select 1 from ad_live where public_id = ${publicId}`).length === 1;

		await sql`
			insert into ad (public_id, band_name, commitment, country_code, lat, lng,
			                display_lat, display_lng, contact_email)
			values (${publicId}, 'Test Band', 'casual', 'GR', 37.98, 23.72, 37.99, 23.73,
			        'test@example.com')
		`;
		try {
			assert.equal(await inView(), false, 'an unverified ad was on the board');

			// published_implies_verified: the board cannot show an ad whose
			// email was never confirmed, and the constraint says so.
			await sql`
				update ad set status = 'published', verified_at = now(), published_at = now()
				where public_id = ${publicId}
			`;
			assert.equal(await inView(), true, 'a published ad was missing from the board');

			await sql`update ad set expires_at = now() - interval '1 minute' where public_id = ${publicId}`;
			assert.equal(await inView(), false, 'an expired ad stayed on the board');
		} finally {
			await sql`delete from ad where public_id = ${publicId}`;
		}
	});
});
