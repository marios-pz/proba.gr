import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** /results was folded into / once the region step (and the wizard it
 *  gated) went away. This keeps an old ?c=&r=&i=&g=&m= link alive by
 *  translating it rather than breaking it outright. */
export const GET: RequestHandler = ({ url }) => {
	const q = new URLSearchParams(url.searchParams);
	q.delete('r');
	redirect(301, `/?${q}`);
};
