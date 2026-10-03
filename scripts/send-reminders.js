#!/usr/bin/env node
/**
 * Sends the day-11 "your ad expires soon" email for every row
 * `ad_needs_reminder` selects (published, not yet reminded, 3 days or
 * less from expiry), each with its own single-use renew link, then
 * marks the row reminded so it is not sent twice.
 *
 * Also reaps expired ads, see the call at the end of main().
 *
 * Not scheduled by anything in this repo:
 * wire it to a cron/systemd timer/hosting-platform scheduler, once a day
 * is plenty since the window is 3 days wide. Plain JavaScript, run
 * standalone, no build step, same reasoning as bootstrap.js.
 *
 *   node scripts/send-reminders.js
 */
import postgres from 'postgres';
import { Resend } from 'resend';

const DATABASE_URL = process.env.DATABASE_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:3000';
const FROM = process.env.MAIL_FROM ?? 'Proba <onboarding@resend.dev>';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');

const sql = postgres(DATABASE_URL, { max: 1 });
const resend = new Resend(RESEND_API_KEY);

const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const mintNudgeToken = () =>
	[...crypto.getRandomValues(new Uint8Array(20))].map((b) => ALPHA[b & 31]).join('');

async function main() {
	const rows = await sql`
    select id, public_id, band_name, contact_email,
           greatest(0, ceil(extract(epoch from expires_at - now()) / 86400))::int as days_left
    from ad_needs_reminder
  `;
	console.log(`${rows.length} ad(s) due a reminder`);

	let sent = 0;
	for (const row of rows) {
		const nudgeToken = mintNudgeToken();
		try {
			const renewUrl = `${ORIGIN}/renew?id=${row.public_id}&nudge=${nudgeToken}`;
			await resend.emails.send({
				from: FROM,
				to: row.contact_email,
				subject: `${row.band_name}'s ad comes down in ${row.days_left} day${row.days_left === 1 ? '' : 's'}`,
				text:
					`Your ad for ${row.band_name} expires in ${row.days_left} day${row.days_left === 1 ? '' : 's'} ` +
					`and will be deleted, not archived.\n\n` +
					`Renew it for another 14 days: ${renewUrl}\n\n` +
					`This link works once and expires in 48 hours. If you'd rather let it expire, no action is needed.`,
			});
			// Set together so a token is never persisted without also being
			// marked sent, and vice versa.
			await sql`
        update ad
           set renew_nudge_token_hash = digest(${nudgeToken}, 'sha256'),
               renew_nudge_expires_at = now() + interval '48 hours',
               reminded_at            = now()
         where id = ${row.id}
      `;
			sent++;
		} catch (err) {
			// Leave reminded_at null: a failed send is retried on the next run.
			console.error(`  failed for ${row.public_id} (${row.band_name}):`, err.message);
		}
	}
	console.log(`sent ${sent}/${rows.length}`);

	// Reaped here as well as at boot, because a long-running instance never
	// boots again and an expired row keeps a contact email, a street address
	// and an exact rehearsal-room position alive indefinitely. This job
	// already has to run daily, so it costs one query and no new cron entry.
	// Split it into its own script if the schedules ever need to differ.
	const [{ reap_expired_ads: reaped }] = await sql`select reap_expired_ads()`;
	console.log(`reaped ${reaped} expired ad(s)`);
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(() => sql.end({ timeout: 5 }));
