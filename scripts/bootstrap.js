#!/usr/bin/env node
/**
 * Database gate. Runs before the server in both `npm run dev` and
 * `npm start`, and decides one of three things:
 *
 *   empty database  -> create the schema, then load reference data
 *   existing schema -> apply any migrations that have not run yet
 *   anything throws -> print why and exit non-zero, so the site never starts
 *
 * That last line is the point. A half-migrated database serving traffic is
 * worse than downtime: it fails per-request, in ways that look like bugs.
 * Exiting here means `npm start` stops with the migration error on screen.
 *
 * Plain JavaScript on purpose. This file must run before any build step
 * exists, so it must not need one.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'drizzle');

const c = {
	dim: (s) => `\x1b[2m${s}\x1b[0m`,
	red: (s) => `\x1b[31m${s}\x1b[0m`,
	green: (s) => `\x1b[32m${s}\x1b[0m`,
	yellow: (s) => `\x1b[33m${s}\x1b[0m`,
	bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
const log = (...a) => console.log('  ', ...a);

// Extensions must exist before the first migration runs, because citext is
// used as a column type. Drizzle does not emit these, so they live here.
const EXTENSIONS = ['pgcrypto', 'citext', 'cube', 'earthdistance', 'pg_trgm'];

// Postgres advisory lock, so two instances booting at once cannot both try
// to migrate. Any constant works as long as everyone agrees on it.
const LOCK_ID = 4_073_218_119;

async function main() {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
	}

	console.log(c.bold('\n  proba  database bootstrap'));
	log(c.dim(url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@')));

	const sql = postgres(url, { max: 1, onnotice: () => {} });

	try {
		await sql`select 1`;
	} catch (err) {
		throw new Error(
			`cannot reach the database.\n     ${err.message}\n` +
				`     Is Postgres running, and is DATABASE_URL pointing at it?`,
		);
	}

	try {
		await sql`select pg_advisory_lock(${LOCK_ID})`;

		/* ---- extensions ------------------------------------------------ */
		for (const ext of EXTENSIONS) {
			await sql.unsafe(`create extension if not exists "${ext}"`);
		}
		log(c.dim(`extensions ok (${EXTENSIONS.join(', ')})`));

		/* ---- empty or not? ---------------------------------------------- */
		// "Empty" means our own tables are absent. A database holding only
		// Postgres' own catalogue still counts as empty for our purposes.
		const [{ count: tableCount }] = await sql`
			select count(*)::int as count
			from information_schema.tables
			where table_schema = 'public' and table_type = 'BASE TABLE'
		`;
		const fresh = tableCount === 0;
		log(
			fresh
				? c.yellow('database is empty, creating the schema from scratch')
				: c.dim(`found ${tableCount} existing tables, checking for updates`),
		);

		/* ---- migrate ----------------------------------------------------- */
		const applied = await migrate(sql);
		log(
			applied.length
				? c.green(
						`applied ${applied.length} migration${applied.length === 1 ? '' : 's'}: ${applied.join(', ')}`,
					)
				: c.dim('schema already up to date, nothing to apply'),
		);

		/* ---- reference data ---------------------------------------------- */
		// Idempotent: safe on every boot, not just the first one. New
		// instruments or countries land automatically on the next deploy.
		const seeded = await seedReference(sql);
		log(c.dim(`reference data: ${seeded}`));

		/* ---- reap -------------------------------------------------------- */
		// An expired ad is invisible (ad_live filters it out) but the row is
		// still there, holding a contact email, a street address and the exact
		// position of a rehearsal room. "Ads die after 14 days and are deleted,
		// not archived" has to be true of the table, not just of the view.
		//
		// Here, at boot, because this is the only thing that provably runs
		// before the server serves a request, on both `npm run dev` and
		// `npm start`. Relaunching after five months of downtime therefore
		// clears five months of dead rows before anything is served. A
		// long-running instance never boots again, so send-reminders.js reaps
		// too; that job already has to run daily.
		const [{ reap_expired_ads: reaped }] = await sql`select reap_expired_ads()`;
		log(
			reaped
				? c.yellow(`reaped ${reaped} expired ad${reaped === 1 ? '' : 's'}`)
				: c.dim('no expired ads to reap'),
		);

		console.log(c.green('   ready\n'));
	} finally {
		await sql`select pg_advisory_unlock(${LOCK_ID})`.catch(() => {});
		await sql.end({ timeout: 5 });
	}
}

/* --------------------------------------------------------------------- */
/* Migration runner. Small enough to own outright, and owning it means the */
/* failure message says which file broke and on which statement.          */
/* --------------------------------------------------------------------- */
async function migrate(sql) {
	await sql`
		create table if not exists _migrations (
			name       text primary key,
			applied_at timestamptz not null default now(),
			checksum   text not null
		)
	`;

	const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();

	const done = new Map(
		(await sql`select name, checksum from _migrations`).map((r) => [r.name, r.checksum]),
	);
	const applied = [];

	for (const name of files) {
		const body = await readFile(join(MIGRATIONS, name), 'utf8');
		const checksum = await hash(body);

		if (done.has(name)) {
			// A migration that changed after it ran means someone edited
			// history. Refuse rather than guess what the database contains.
			if (done.get(name) !== checksum) {
				throw new Error(
					`migration ${name} has changed since it was applied.\n` +
						`     Migrations are immutable once they run. Add a new one instead.`,
				);
			}
			continue;
		}

		// drizzle-kit separates statements with this marker; keep them in one
		// transaction so a failure halfway leaves nothing behind.
		const statements = body
			.split('--> statement-breakpoint')
			.map((s) => s.trim())
			.filter(Boolean);

		try {
			await sql.begin(async (tx) => {
				for (const stmt of statements) await tx.unsafe(stmt);
				await tx`insert into _migrations (name, checksum) values (${name}, ${checksum})`;
			});
			applied.push(name);
		} catch (err) {
			throw new Error(
				`migration ${c.bold(name)} failed and was rolled back.\n` +
					`     ${err.message}` +
					(err.position ? `\n     at character ${err.position}` : ''),
			);
		}
	}
	return applied;
}

async function hash(text) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* --------------------------------------------------------------------- */
/* Reference data                                                         */
/* --------------------------------------------------------------------- */
const INSTRUMENTS = [
	['drums', 'Drums', 10],
	['bass', 'Bass', 20],
	['rhythm-guitar', 'Rhythm guitar', 30],
	['lead-guitar', 'Lead guitar', 40],
	['vocals', 'Vocals', 50],
	['keys', 'Keys', 60],
	['violin', 'Violin', 70],
	['sax', 'Sax', 80],
	['harmonica', 'Harmonica', 90],
	['other', 'Other', 999],
];
const GENRES = [
	['thrash', 'Thrash', 10],
	['death-metal', 'Death metal', 20],
	['black-metal', 'Black metal', 30],
	['heavy-metal', 'Heavy metal', 40],
	['doom-stoner', 'Doom / Stoner', 50],
	['hardcore', 'Hardcore', 60],
	['punk', 'Punk', 70],
	['grunge', 'Grunge', 80],
	['alt-rock', 'Alt rock', 90],
	['prog', 'Prog', 100],
	['classic-rock', 'Classic rock', 110],
	['blues-rock', 'Blues rock', 120],
	['post-rock', 'Post-rock', 130],
	['indie', 'Indie', 140],
];

async function seedReference(sql) {
	for (const [slug, label, sort] of INSTRUMENTS) {
		await sql`insert into instrument (slug, label_en, sort) values (${slug}, ${label}, ${sort})
		          on conflict (slug) do update set label_en = excluded.label_en, sort = excluded.sort`;
	}
	for (const [slug, label, sort] of GENRES) {
		await sql`insert into genre (slug, label_en, sort) values (${slug}, ${label}, ${sort})
		          on conflict (slug) do update set label_en = excluded.label_en, sort = excluded.sort`;
	}

	const countries = JSON.parse(await readFile(join(ROOT, 'src/lib/data/countries.json'), 'utf8'));

	for (const co of countries) {
		await sql`insert into country (code, name_en)
		          values (${co.c}, ${co.n})
		          on conflict (code) do update set name_en = excluded.name_en`;
	}

	return (
		`${INSTRUMENTS.length} instruments, ${GENRES.length} genres, ` + `${countries.length} countries`
	);
}

main().catch((err) => {
	console.error(c.red('\n   bootstrap failed, the server will not start\n'));
	console.error('  ', err.message, '\n');
	process.exit(1);
});
