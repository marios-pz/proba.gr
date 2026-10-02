import { fail } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { text, picks, slugsOf } from '$lib/server/form';
import { mintToken, hashToken, publicId, hashIp } from '$lib/server/token';
import { jitter } from '$lib/server/geo';
import { sendVerificationEmail } from '$lib/server/email';
import { INSTRUMENTS, GENRES, COMMITMENTS, SOCIAL_KINDS, AD_KINDS } from '$lib/taxonomy';
import { env } from '$env/dynamic/private';
import countries from '$lib/data/countries.json';

/** Anything a client sends that is not in these is dropped or rejected. */
const VALID = {
	instrument: slugsOf(INSTRUMENTS),
	genre: slugsOf(GENRES),
	commitment: slugsOf(COMMITMENTS),
	social: slugsOf(SOCIAL_KINDS),
	kind: slugsOf(AD_KINDS),
};
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const load: PageServerLoad = async () => ({ countries });

export const actions: Actions = {
	default: async ({ request, getClientAddress, url }) => {
		const f = await request.formData();

		const bandName = text(f, 'band_name');
		const blurb = text(f, 'blurb').slice(0, 600);
		const countryCode = text(f, 'country').toUpperCase();
		const commitment = text(f, 'commitment') || 'casual';
		const kind = text(f, 'kind') || 'member';
		const email = text(f, 'email');
		const address = text(f, 'address') || null;
		const paid = f.get('paid') === 'on';
		const instruments = picks(f, 'instrument', VALID.instrument);
		const genres = picks(f, 'genre', VALID.genre);
		const lat = Number(f.get('pin_lat'));
		const lng = Number(f.get('pin_lng'));

		// Sent as a full ISO string, converted client-side from a
		// datetime-local input using the browser's own timezone: parsing a
		// bare "2026-09-10T19:00" here, on the server, would use the
		// server's timezone instead of the poster's.
		const eventAtRaw = text(f, 'event_at');
		const dated = kind !== 'member';
		const eventAt = dated && eventAtRaw ? new Date(eventAtRaw) : null;

		// Kept as parallel arrays, index-aligned by the template's own
		// each-block order, then zipped and cleaned here in one place.
		const handles = f.getAll('social_url').map(String);
		const socials = f
			.getAll('social_kind')
			.map((k, i) => ({ kind: String(k), handle: handles[i]?.trim() ?? '' }))
			.filter((s) => VALID.social.has(s.kind) && s.handle);

		// Echoed back with any failure so the form redraws filled in.
		const values = {
			bandName,
			blurb,
			cc: countryCode,
			commitment,
			kind,
			eventAt: eventAtRaw,
			email,
			address,
			instruments,
			genres,
			paid,
		};
		const reject = (message: string) => fail(400, { ...values, error: message });

		const inRange = (n: number, limit: number) => Number.isFinite(n) && Math.abs(n) <= limit;

		if (!bandName) return reject('The band needs a name.');
		if (!inRange(lat, 90) || !inRange(lng, 180))
			return reject('Drop the pin on the map so people know where to come.');
		if (!instruments.length) return reject('Pick at least one instrument you need.');
		if (!VALID.commitment.has(commitment)) return reject('Pick how serious this is.');
		if (!VALID.kind.has(kind)) return reject('Pick what kind of post this is.');
		if (dated && !(eventAt && eventAt.getTime() > Date.now()))
			return reject('Pick a date and time for it, still ahead of now.');
		if (!socials.length)
			return reject('Give at least one place where you want to be contacted, with a real link.');
		if (!EMAIL.test(email))
			return reject('The email is only used for the renewal link. It is never shown.');

		// ponytail: counted off the ad rows themselves, unverified ones
		// included. A rate_bucket window if this ever needs tuning.
		const ipHash = hashIp(getClientAddress(), env.IP_SALT ?? 'dev');
		const [{ n }] = (await db.execute(sql`
			select count(*)::int as n from ad
			where created_ip_hash = ${ipHash} and created_at > now() - interval '24 hours'
		`)) as unknown as { n: number }[];
		if (n >= 5) return reject('That is a lot of ads for one day. Try again tomorrow.');

		const shown = jitter(lat, lng, 700);
		// Not the edit token: that one is minted only once verify_ad()
		// succeeds, so it never exists in plaintext before the poster has
		// proven they hold this inbox.
		const verifyToken = mintToken();
		const id = publicId();

		try {
			await db.transaction(async (tx) => {
				const [{ id: adId }] = (await tx.execute(sql`
					insert into ad (public_id, band_name, blurb, commitment, kind, event_at, paid,
					                country_code, lat, lng, address, display_lat, display_lng,
					                contact_email, status, verify_token_hash, verify_expires_at,
					                created_ip_hash)
					values (${id}, ${bandName}, ${blurb}, ${commitment}, ${kind}::ad_kind,
					        ${eventAt?.toISOString() ?? null}, ${paid},
					        ${countryCode}, ${lat}, ${lng}, ${address}, ${shown.lat}, ${shown.lng},
					        ${email}, 'unverified', ${hashToken(verifyToken)}, now() + interval '24 hours',
					        ${ipHash})
					returning id
				`)) as unknown as { id: string }[];

				for (const s of socials)
					await tx.execute(sql`
						insert into ad_link (ad_id, kind, handle)
						values (${adId}, ${s.kind}::link_kind, ${s.handle})
					`);
				for (const slug of instruments)
					await tx.execute(sql`insert into ad_role (ad_id, instrument) values (${adId}, ${slug})`);
				for (const slug of genres)
					await tx.execute(sql`insert into ad_genre (ad_id, genre) values (${adId}, ${slug})`);
			});
		} catch (err) {
			console.error('ad insert failed', err);
			return fail(500, { ...values, error: 'Could not save the ad. Try again.' });
		}

		try {
			// Fixed origin, not the request's own: the request could come in
			// on 127.0.0.1 or an internal LAN address depending on how this
			// instance is reached, but an email is read from anywhere, so
			// the link inside it needs a host that means something there.
			// Same ORIGIN adapter-node already requires for its own
			// same-origin form check (see docker-compose.yml) and the one
			// send-reminders.js already uses for its renewal links.
			const origin = env.ORIGIN ?? url.origin;
			await sendVerificationEmail(
				email,
				bandName,
				`${origin}/verify?id=${id}&token=${verifyToken}`,
			);
		} catch (err) {
			console.error('verification email failed', err);
			return fail(500, {
				...values,
				error: 'The ad was saved but the confirmation email could not be sent. Try posting again.',
			});
		}

		return { posted: true, bandName, email };
	},
};
