import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ownedAd, pingAd, closeRole, deleteAd } from '$lib/server/queries';
import { text } from '$lib/server/form';

/** Everything an ad's owner can do, behind the code + token from the email.
 *  The link in that email lands here with both in the URL; the form below
 *  is for typing them by hand. Every action re-checks the token itself. */
export const load: PageServerLoad = async ({ url }) => {
	const id = url.searchParams.get('id')?.trim() ?? '';
	const token = url.searchParams.get('token')?.trim() ?? '';
	if (!id || !token) return { ad: null, id, token, bad: false };
	const ad = await ownedAd(id, token);
	return { ad, id, token, bad: !ad };
};

// Deliberately vague, like everywhere else: which half was wrong would let
// someone walk the public_id space to find out which ads exist.
const WRONG = 'That code and token do not go together, or the ad has already been deleted.';

const creds = (f: FormData) => ({ id: text(f, 'id'), token: text(f, 'token') });

export const actions: Actions = {
	renew: async ({ request }) => {
		const { id, token } = creds(await request.formData());
		const until = await pingAd(id, token);
		if (!until) return fail(400, { error: WRONG });
		return { renewed: true };
	},

	fill: async ({ request }) => {
		const f = await request.formData();
		const { id, token } = creds(f);
		if (!(await closeRole(id, token, text(f, 'instrument')))) return fail(400, { error: WRONG });
		return { filled: true };
	},

	delete: async ({ request }) => {
		const f = await request.formData();
		const { id, token } = creds(f);
		if (!(await deleteAd(id, token))) return fail(400, { error: WRONG });
		return { deleted: true, bandName: text(f, 'band_name') };
	},
};
