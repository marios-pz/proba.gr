import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordAdView } from '$lib/server/queries';
import { hashIp } from '$lib/server/token';
import { env } from '$env/dynamic/private';

/** Fired once per ad a visitor actually opens. Counted in the database via
 *  record_ad_view(), keyed on a hashed IP so the same viewer re-opening (or
 *  refreshing) the same ad inside its window does not inflate the count. */
export const POST: RequestHandler = async ({ params, getClientAddress }) => {
	const viewerHash = hashIp(getClientAddress(), env.IP_SALT ?? 'dev');
	const viewCount = await recordAdView(params.id ?? '', viewerHash);
	if (viewCount === null) error(404, 'not found');
	return json({ view_count: viewCount });
};
