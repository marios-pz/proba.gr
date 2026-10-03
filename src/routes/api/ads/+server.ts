import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { liveAds } from '$lib/server/queries';

/** Switching country reloads the board without a full navigation. */
export const GET: RequestHandler = async ({ url }) => {
	const cc = (url.searchParams.get('c') ?? '').toUpperCase();
	if (!/^[A-Z]{2}$/.test(cc)) error(400, 'bad country code');
	return json(await liveAds(cc));
};
