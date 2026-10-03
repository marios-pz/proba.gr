import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { reportAd } from '$lib/server/queries';
import { sendReportEmail } from '$lib/server/email';
import { hashIp } from '$lib/server/token';
import { REPORT_REASONS } from '$lib/taxonomy';
import { env } from '$env/dynamic/private';

const REASONS = new Set<string>(REPORT_REASONS.map(([slug]) => slug));

/**
 * The red flag on an ad card. No token, no account: reporting has to work
 * for the person who just found the ad, which is everybody.
 *
 * Answers 202 for a live ad, a repeat click and an id that does not exist
 * alike. Only the reason being unknown is a 400. Saying "no such ad" here
 * would hand out a way to test which public_ids are real, which is the one
 * thing the rest of this API is careful never to do.
 */
export const POST: RequestHandler = async ({ params, request, getClientAddress, url }) => {
	const body = await request.json().catch(() => null);
	const reason = String(body?.reason ?? '');
	const detail = String(body?.detail ?? '')
		.trim()
		.slice(0, 600);

	if (!REASONS.has(reason)) error(400, 'unknown reason');

	const publicId = params.id ?? '';
	const reporterHash = hashIp(getClientAddress(), env.IP_SALT ?? 'dev');
	const bandName = await reportAd(publicId, reason, detail, reporterHash);

	// Empty string means "this reporter already flagged it", null means the
	// ad is not live. Neither is worth an email, and neither is worth
	// telling the client apart from success.
	if (bandName) {
		const origin = env.ORIGIN ?? url.origin;
		try {
			// Just the board's origin: ads have no URL of their own (they are
			// selected client-side), so a per-ad deep link would be fiction.
			const sent = await sendReportEmail({ publicId, bandName, reason, detail, board: origin });
			// The report is already committed. A missing ADMIN_EMAIL or a
			// dead mail provider must not lose it, so it goes to the log.
			if (!sent)
				console.warn(`report recorded for ${publicId} (${reason}), ADMIN_EMAIL is not set`);
		} catch (err) {
			console.error(`report recorded for ${publicId} (${reason}), email failed`, err);
		}
	}

	return json({ ok: true }, { status: 202 });
};
