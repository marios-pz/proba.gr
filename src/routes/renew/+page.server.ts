import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { renewViaNudge } from '$lib/server/queries';
import { text } from '$lib/server/form';

/** Answers with the date the ad is
 *  now alive until, as a plain YYYY-MM-DD. */
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Only the reminder email's one-click link lands here now. Renewing by
 *  hand, with the code and token, moved to /manage with everything else. */
export const load: PageServerLoad = async ({ url }) => {
	const nudgeId = url.searchParams.get('id') ?? '';
	const nudge = url.searchParams.get('nudge') ?? '';
	if (!nudgeId || !nudge) redirect(301, '/manage');
	return { nudgeId, nudge };
};

export const actions: Actions = {
	// The day-11 reminder email's one-click link: its own single-use
	// token, not the edit token (see the migration comment for why), so
	// this never touches pingAd/the token the person actually saved.
	nudge: async ({ request }) => {
		const f = await request.formData();
		const id = text(f, 'id');
		const nudge = text(f, 'nudge');
		if (!id || !nudge) return fail(400, { error: 'This link is missing its code or token.' });

		const until = await renewViaNudge(id, nudge);
		if (!until) return fail(400, { error: 'This link is invalid or has expired.' });
		return { renewed: true, until: day(until) };
	},
};
