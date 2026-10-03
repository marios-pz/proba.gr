import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

/**
 * Lazy singleton, same reasoning as `server/db`: the build step imports
 * every server module, so constructing this at module load would make
 * `npm run build` require RESEND_API_KEY. It should not.
 */
let _resend: Resend | null = null;
function client(): Resend {
	if (_resend) return _resend;
	if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
	_resend = new Resend(env.RESEND_API_KEY);
	return _resend;
}

// Resend's own keyless sandbox sender. Delivers, but only Resend account
// owners can be recipients until a real domain is verified and MAIL_FROM
// is pointed at it. Fine for getting this running, not for real traffic.
const FROM = env.MAIL_FROM ?? 'Proba <onboarding@resend.dev>';

async function send(to: string, subject: string, text: string) {
	const { error } = await client().emails.send({ from: FROM, to, subject, text });
	if (error) throw new Error(`email send failed: ${error.message}`);
}

export async function sendVerificationEmail(to: string, bandName: string, verifyUrl: string) {
	await send(
		to,
		`Confirm your ad for ${bandName}`,
		`One click and it's live: ${verifyUrl}\n\n` +
			`This link works once and expires in 24 hours. If you didn't post this ad, ignore this email.`,
	);
}

export async function sendTokenEmail(
	to: string,
	bandName: string,
	publicId: string,
	token: string,
	manageUrl: string,
) {
	await send(
		to,
		`Your link to manage ${bandName}`,
		`${bandName} is live. Keep this email: the link below is the only way to renew, edit or delete the ad, and it can't be sent again.\n\n` +
			`${manageUrl}\n\n` +
			`Anyone with this link can change the ad, so don't share it.\n\n` +
			`If the link ever breaks, type these on ${new URL(manageUrl).origin}/manage:\n` +
			`Ad code   ${publicId}\n` +
			`Token     ${token}`,
	);
}

export async function sendRenewalReminderEmail(
	to: string,
	bandName: string,
	daysLeft: number,
	renewUrl: string,
) {
	await send(
		to,
		`${bandName}'s ad comes down in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
		`Your ad for ${bandName} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} and will be deleted, not archived.\n\n` +
			`Renew it for another 14 days: ${renewUrl}\n\n` +
			`This link works once and expires in 48 hours. If you'd rather let it expire, no action is needed.`,
	);
}

/**
 * The only email that goes to the operator rather than to a band. Reports
 * are worthless if nobody sees them, and with no admin UI yet the inbox is
 * the queue.
 *
 * Returns false instead of throwing when ADMIN_EMAIL is unset, because the
 * report is already safely in the database by the time this runs: losing
 * the notification is annoying, losing the report because the notification
 * failed would be worse. The caller logs it either way.
 */
export async function sendReportEmail(opts: {
	publicId: string;
	bandName: string;
	reason: string;
	detail: string;
	board: string;
}): Promise<boolean> {
	const to = env.ADMIN_EMAIL;
	if (!to) return false;

	await send(
		to,
		`Report: ${opts.bandName} (${opts.reason})`,
		`${opts.bandName} was reported.\n\n` +
			`Reason   ${opts.reason}\n` +
			`Ad code  ${opts.publicId}\n` +
			`Board    ${opts.board}\n\n` +
			(opts.detail ? `What they wrote:\n${opts.detail}\n\n` : '') +
			`Take it down with:\n` +
			`  select delete_ad('${opts.publicId}', '<edit token>');\n` +
			`or straight from psql:\n` +
			`  delete from ad where public_id = '${opts.publicId}';`,
	);
	return true;
}
