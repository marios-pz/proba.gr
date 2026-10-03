#!/usr/bin/env node
/**
 * Puts five demo ads on the board, or takes them off again.
 *
 * Deliberately NOT part of bootstrap.js. A fresh database starts empty on
 * purpose: an empty board is honest, a board of fake bands is not. This is
 * for looking at the thing while developing, so it has to be run by hand
 * and every band it creates says "(Demo)" in its name.
 *
 * Ads die after 14 days, so re-run this whenever the board has gone quiet.
 * It is idempotent: the public_ids are fixed, so a second run refreshes the
 * same five rows rather than piling up new ones.
 *
 *   node scripts/seed-demo.js            seed, or refresh for another 14 days
 *   node scripts/seed-demo.js --remove   delete them
 */
import postgres from 'postgres';
import { createHash, randomBytes } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

const remove = process.argv.includes('--remove');
const sql = postgres(DATABASE_URL, { max: 1 });

const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // matches src/lib/server/token.ts
const mintToken = () =>
	[...randomBytes(20)]
		.map((b) => ALPHA[b & 31])
		.join('')
		.replace(/(.{4})/g, '$1-')
		.replace(/-$/, '');
const hashToken = (t) => createHash('sha256').update(t).digest();

/** Same 700m push as src/lib/server/geo.ts, uniform inside the disc. */
function jitter(lat, lng, metres = 700) {
	const ang = Math.random() * 2 * Math.PI;
	const rad = Math.sqrt(Math.random()) * metres;
	return {
		lat: +(lat + (rad * Math.cos(ang)) / 111_320).toFixed(6),
		lng: +(lng + (rad * Math.sin(ang)) / (111_320 * Math.cos((lat * Math.PI) / 180))).toFixed(6),
	};
}

const days = (n) => new Date(Date.now() + n * 86400000);

// Spread across five cities, both board views (three standing "member"
// posts, one gig, one rehearsal), and a mix of paid/unpaid and commitment
// levels, so the ranking and the Gigs/Recruit switch both have something
// to chew on. Instruments and genres are slugs from src/lib/taxonomy.ts.
const ADS = [
	{
		id: 'demo01',
		name: 'Tsimentokipos (Demo)',
		blurb:
			'Rehearsing twice a week in Exarchia, aiming for gigs by spring. Somewhere between Sabbath and Kyuss, more groove than technique. Bring your own cab.',
		city: 'Athens, Exarchia',
		lat: 37.9865,
		lng: 23.7333,
		kind: 'member',
		commitment: 'serious',
		paid: false,
		needs: ['drums', 'bass'],
		genres: ['doom-stoner', 'heavy-metal'],
		links: [['instagram', 'https://instagram.com/tsimentokipos']],
	},
	{
		id: 'demo02',
		name: 'Anemoi tou Voria (Demo)',
		blurb:
			'Two guitars and a drummer, no singer. Atmospheric black metal with post-rock parts. We care more about someone who shows up than someone who shreds.',
		city: 'Thessaloniki',
		lat: 40.633,
		lng: 22.941,
		kind: 'member',
		commitment: 'casual',
		paid: false,
		needs: ['vocals'],
		genres: ['black-metal', 'post-rock'],
		links: [
			['bandcamp', 'https://anemoitouvoria.bandcamp.com'],
			['instagram', 'https://instagram.com/anemoitouvoria'],
		],
	},
	{
		id: 'demo03',
		name: 'Diodia (Demo)',
		blurb:
			'Long songs, odd time signatures, no apologies. Album half written, studio booked for February. Looking for people who can read a chart but do not need one.',
		city: 'Patra',
		lat: 38.2466,
		lng: 21.7346,
		kind: 'member',
		commitment: 'professional',
		paid: true,
		needs: ['lead-guitar', 'keys'],
		genres: ['prog', 'alt-rock'],
		links: [
			['youtube', 'https://youtube.com/@diodia'],
			['website', 'https://diodia.gr'],
		],
	},
	{
		id: 'demo04',
		name: 'Seismos 4.2 (Demo)',
		blurb:
			'Our bassist broke his wrist four days before the show. Twelve songs, all fast, all under two minutes. Setlist and rough recordings sent the moment you message.',
		city: 'Athens, Gazi',
		lat: 37.978,
		lng: 23.715,
		kind: 'gig',
		eventInDays: 5,
		commitment: 'serious',
		paid: true,
		needs: ['bass'],
		genres: ['punk', 'hardcore'],
		links: [['instagram', 'https://instagram.com/seismos42']],
	},
	{
		id: 'demo05',
		name: 'Kyma Skonis (Demo)',
		blurb:
			'One rehearsal, Thursday night, three hours. Our drummer is out of town and we want to keep the room booked. Grunge covers mostly, nothing you have not heard.',
		city: 'Volos',
		lat: 39.3622,
		lng: 22.9422,
		kind: 'rehearsal',
		eventInDays: 2,
		commitment: 'casual',
		paid: false,
		needs: ['drums'],
		genres: ['grunge', 'alt-rock'],
		links: [['soundcloud', 'https://soundcloud.com/kymaskonis']],
	},
];

const IDS = ADS.map((a) => a.id);

async function main() {
	if (remove) {
		// ad_role, ad_genre and ad_link are all on delete cascade.
		const gone = await sql`delete from ad where public_id in ${sql(IDS)} returning public_id`;
		console.log(`  removed ${gone.length} demo ad${gone.length === 1 ? '' : 's'}`);
		return;
	}

	const tokens = [];

	for (const a of ADS) {
		const shown = jitter(a.lat, a.lng);
		const token = mintToken();

		await sql.begin(async (tx) => {
			// Replace rather than update: simpler than reconciling the child
			// rows, and the cascade takes care of them.
			await tx`delete from ad where public_id = ${a.id}`;

			const [row] = await tx`
        insert into ad (
          public_id, band_name, blurb, commitment, kind, event_at, paid,
          country_code, lat, lng, address, display_lat, display_lng,
          contact_email, status, verified_at, published_at, expires_at,
          edit_token_hash
        ) values (
          ${a.id}, ${a.name}, ${a.blurb}, ${a.commitment}, ${a.kind}::ad_kind,
          ${a.eventInDays ? days(a.eventInDays) : null}, ${a.paid},
          'GR', ${a.lat}, ${a.lng}, ${a.city}, ${shown.lat}, ${shown.lng},
          ${`demo.${a.id}@example.com`}, 'published', now(), now(), ${days(14)},
          ${hashToken(token)}
        ) returning id`;

			for (const slug of a.needs)
				await tx`insert into ad_role (ad_id, instrument) values (${row.id}, ${slug})`;
			for (const slug of a.genres)
				await tx`insert into ad_genre (ad_id, genre) values (${row.id}, ${slug})`;
			for (const [kind, handle] of a.links)
				await tx`insert into ad_link (ad_id, kind, handle)
                 values (${row.id}, ${kind}::link_kind, ${handle})`;
		});

		tokens.push([a.id, a.name, token]);
	}

	const [{ n }] = await sql`select count(*)::int as n from ad_live`;
	console.log(`  seeded ${ADS.length} demo ads, ${n} now live on the board\n`);
	console.log('  edit tokens (for testing /renew, not stored in plaintext anywhere else):');
	for (const [id, name, token] of tokens) console.log(`    ${id}  ${token}  ${name}`);
	console.log('\n  remove them with: node scripts/seed-demo.js --remove');
}

try {
	await main();
} finally {
	await sql.end();
}
