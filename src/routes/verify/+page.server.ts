import { fail } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { verifyAd, bumpStat } from '$lib/server/queries';
import { mintToken, hashToken } from '$lib/server/token';
import { sendTokenEmail } from '$lib/server/email';
import { text } from '$lib/server/form';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ url }) => ({
	id: url.searchParams.get('id') ?? '',
	token: url.searchParams.get('token') ?? '',
});

export const actions: Actions = {
	// Deliberately a POST triggered by a real button, not verification on
	// the GET that loads this page: mail security scanners routinely
	// pre-visit links to check them for malware, which would otherwise
	// burn a one-time verify token before the person who received the
	// email ever clicks it themselves.
	default: async ({ request, url }) => {
		const f = await request.formData();
		const id = text(f, 'id');
		const token = text(f, 'token');

		// Same vagueness as the renew endpoint: a wrong token and an
		// already-used or expired one look identical from the outside.
		const invalid = () => fail(400, { error: 'This link is invalid or has expired.' });
		if (!id || !token) return invalid();

		const ok = await verifyAd(id, token);
		if (!ok) return invalid();
		await bumpStat('ads_posted').catch((err) => console.error('ads_posted count failed', err));

		const editToken = mintToken();
		const rows = await db.execute(sql`
			update ad set edit_token_hash = ${hashToken(editToken)}
			 where public_id = ${id}
			returning band_name, contact_email
		`);
		const row = (rows as unknown as { band_name: string; contact_email: string }[])[0];
		if (!row) return invalid();

		try {
			// Same fixed origin as the verify link: see the post action.
			const origin = env.ORIGIN ?? url.origin;
			await sendTokenEmail(
				row.contact_email,
				row.band_name,
				id,
				editToken,
				`${origin}/manage?id=${id}&token=${editToken}`,
			);
		} catch (err) {
			console.error('token email failed', err);
			return fail(500, {
				error:
					'Verified, but the token email could not be sent. Contact the admin, the ad is live but you have no way to edit it.',
			});
		}

		return { verified: true, bandName: row.band_name };
	},
};
