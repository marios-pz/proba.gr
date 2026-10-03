import { sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import type { AdRow } from '$lib/types';

export type { AdRow, AdLink } from '$lib/types';

/** Rows, typed. `db.execute` is untyped by design, so the cast happens once
 *  here instead of at every call site. */
const rows = async <T>(query: SQL): Promise<T[]> => (await db.execute(query)) as unknown as T[];

/** The single scalar a SQL function call returns, aliased `v` by every
 *  caller below. Null means "no ad, or wrong token", deliberately
 *  indistinguishable: telling them apart would let someone walk the
 *  public_id space to discover which ads exist. */
const scalar = async <T>(query: SQL): Promise<T | null> =>
	(await rows<{ v: T | null }>(query))[0]?.v ?? null;

/** Tokens are shown uppercase and pasted back by hand, so every lookup
 *  normalises before hashing. */
const normalize = (token: string) => token.trim().toUpperCase();

const toDate = (iso: string | null) => (iso ? new Date(iso) : null);

/**
 * Everything live in one country. Deliberately unfiltered by instrument or
 * genre: the client ranks and never hides a row. Hard filters produce empty
 * pages, and an empty page on a first visit is what kills a board before
 * the network exists.
 */
export const liveAds = (countryCode: string) =>
	rows<AdRow>(sql`
		select a.public_id, a.band_name, a.blurb, a.country_code,
		       a.display_lat, a.display_lng, a.commitment, a.kind, a.event_at,
		       a.paid, a.view_count,
		       greatest(0, ceil(extract(epoch from a.expires_at - now()) / 86400))::int as days_left,
		       coalesce(array(select r.instrument from ad_role r
		                       where r.ad_id = a.id and r.filled_at is null), '{}') as needs,
		       coalesce(array(select g.genre from ad_genre g where g.ad_id = a.id), '{}')
		         || a.custom_genres as genres,
		       coalesce((select json_agg(json_build_object('kind', l.kind::text, 'handle', l.handle))
		                 from ad_link l where l.ad_id = a.id), '[]') as links
		from ad_live a
		where a.country_code = ${countryCode}
		order by a.published_at desc
	`);

/** Drives the ad counts beside each country in the picker. */
export async function adCountsByCountry(): Promise<Record<string, number>> {
	const counts = await rows<{ country_code: string; n: number }>(
		sql`select country_code, count(*)::int as n from ad_live group by country_code`,
	);
	return Object.fromEntries(counts.map((c) => [c.country_code, c.n]));
}

/** The click that opens an ad's full detail. Counted in the database, keyed
 *  on a hashed viewer so refresh-spam on the same ad within the window is
 *  absorbed rather than inflating the count. Null for an id that is not (or
 *  no longer) live. */
export const recordAdView = (publicId: string, viewerHash: Buffer) =>
	scalar<number>(sql`select record_ad_view(${publicId}, ${viewerHash.toString('hex')}) as v`);

/** Extends an ad by 14 days from today. Non-stacking, by design: see the
 *  greatest() in ping_ad itself. */
export const pingAd = async (publicId: string, editToken: string) =>
	toDate(await scalar<string>(sql`select ping_ad(${publicId}, ${normalize(editToken)}) as v`));

/** The verify-link click. On success the ad flips to published; the edit
 *  token itself is minted separately, by the caller, only once this
 *  returns true. */
export const verifyAd = async (publicId: string, verifyToken: string) =>
	(await scalar<boolean>(sql`select verify_ad(${publicId}, ${normalize(verifyToken)}) as v`)) ===
	true;

/** The day-11 reminder email's "renew now" link: a single-use token minted
 *  just for that email, never the real edit token (see the migration
 *  comment for why). */
export const renewViaNudge = async (publicId: string, nudgeToken: string) =>
	toDate(
		await scalar<string>(sql`select renew_via_nudge(${publicId}, ${normalize(nudgeToken)}) as v`),
	);

/** A flag click. Returns the band name when the report was newly recorded
 *  (the caller emails the admin on that, and only that), an empty string
 *  when this reporter already flagged the ad inside the window, and null
 *  for an id that is not live. See 0010_report_ad.sql. */
export const reportAd = (publicId: string, reason: string, detail: string, reporterHash: Buffer) =>
	scalar<string>(sql`
		select report_ad(${publicId}, ${reason}, ${detail}, ${reporterHash.toString('hex')}) as v
	`);

/** +1 on a site_stat counter ('visits', 'ads_posted'). */
export const bumpStat = (key: string) =>
	db.execute(sql`update site_stat set n = n + 1 where key = ${key}`);

/** The numbers on /support. */
export const siteStats = async () =>
	(
		await rows<{ visits: number; posted: number; live: number }>(sql`
			select (select n from site_stat where key = 'visits') as visits,
			       (select n from site_stat where key = 'ads_posted') as posted,
			       (select count(*)::int from ad_live) as live
		`)
	)[0];

/** Everything the owner of an ad may see and change, for /manage and the
 *  edit form. Null for a wrong token, same as every other token check.
 *  Expired-but-not-yet-reaped ads still come back, so they can be renewed. */
export type OwnedAd = {
	public_id: string;
	band_name: string;
	blurb: string;
	country_code: string;
	lat: number;
	lng: number;
	address: string | null;
	commitment: string;
	kind: string;
	event_at: string | null;
	paid: boolean;
	expires_at: string;
	custom_genres: string[];
	roles: { instrument: string; filled: boolean }[];
	genres: string[];
	links: { kind: string; handle: string }[];
};
export const ownedAd = async (publicId: string, editToken: string) =>
	(
		await rows<OwnedAd>(sql`
			select a.public_id, a.band_name, a.blurb, a.country_code, a.lat, a.lng, a.address,
			       a.commitment, a.kind, a.event_at, a.paid, a.expires_at, a.custom_genres,
			       coalesce((select json_agg(json_build_object('instrument', r.instrument,
			                                                   'filled', r.filled_at is not null))
			                 from ad_role r where r.ad_id = a.id), '[]') as roles,
			       coalesce(array(select g.genre from ad_genre g where g.ad_id = a.id), '{}') as genres,
			       coalesce((select json_agg(json_build_object('kind', l.kind::text, 'handle', l.handle))
			                 from ad_link l where l.ad_id = a.id), '[]') as links
			from ad a
			where a.public_id = ${publicId} and a.status = 'published'
			  and a.edit_token_hash = digest(${normalize(editToken)}, 'sha256')
		`)
	)[0] ?? null;

/** "Found someone": the role drops off the ad, the rest stays up. */
export const closeRole = async (publicId: string, editToken: string, instrument: string) =>
	(await scalar<boolean>(
		sql`select close_role(${publicId}, ${normalize(editToken)}, ${instrument}) as v`,
	)) === true;

/** Deleted, not hidden: the row and everything hanging off it go. */
export const deleteAd = async (publicId: string, editToken: string) =>
	(await scalar<boolean>(sql`select delete_ad(${publicId}, ${normalize(editToken)}) as v`)) ===
	true;
