import type { Handle, HandleServerError } from '@sveltejs/kit';
import { bumpStat } from '$lib/server/queries';

/** A visit is a browser loading a page, not each click inside the app
 *  afterwards. Sec-Fetch-Dest: document is only sent by real browsers on a
 *  full page load, so link-preview bots, curl and the app's own data
 *  fetches don't count. Refreshes do: there's no per-person dedup, by
 *  design, since that would mean remembering who visited. */
export const handle: Handle = async ({ event, resolve }) => {
	if (event.request.method === 'GET' && event.request.headers.get('sec-fetch-dest') === 'document')
		bumpStat('visits').catch((err) => console.error('visit count failed', err));
	return resolve(event);
};

/** postgres.js's own connection-failure codes, plus the raw Node ones a
 *  dead or unreachable host throws before postgres.js ever gets to wrap
 *  them. Checked by code first (stable across locales), message as a
 *  fallback for anything that slips through without one. */
const DB_DOWN_CODES = new Set([
	'ECONNREFUSED',
	'ENOTFOUND',
	'ETIMEDOUT',
	'CONNECT_TIMEOUT',
	'CONNECTION_CLOSED',
	'CONNECTION_ENDED',
	'CONNECTION_DESTROYED',
]);

/** Drizzle wraps the real postgres.js/Node error in a DrizzleQueryError, so
 *  the actual ECONNREFUSED lives on `.cause`, not the top-level error.
 *  Walk it rather than assume any particular nesting depth. */
function isDbDown(err: unknown, depth = 0): boolean {
	if (!err || depth > 5) return false;
	const code = (err as { code?: string }).code;
	if (code && DB_DOWN_CODES.has(code)) return true;
	const message = String((err as { message?: string }).message ?? '');
	if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|CONNECT_TIMEOUT|connection.*closed/i.test(message))
		return true;
	return isDbDown((err as { cause?: unknown }).cause, depth + 1);
}

/** The board depends on Postgres for nearly everything, so a dead database
 *  surfaces as an uncaught exception in a load function or action. Without
 *  this, that reaches the browser as SvelteKit's bare "500 / Internal
 *  Error", with no explanation and no way to tell a real outage from a bug. */
export const handleError: HandleServerError = ({ error, status }) => {
	if (isDbDown(error)) {
		console.error('database unreachable:', error);
		return { message: 'The database is down. We are working on it.', dbDown: true as const };
	}
	console.error(error);
	return {
		message: status === 404 ? 'Not found.' : 'Something went wrong.',
		dbDown: false as const,
	};
};
