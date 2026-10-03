/** Shared with the seed lists in scripts/bootstrap.js. Slugs are the API
 *  contract; labels are display only. Used by both the filter form and
 *  the results page, so it lives here rather than duplicated in each. */
export const INSTRUMENTS = [
	['drums', 'Drums'],
	['bass', 'Bass'],
	['rhythm-guitar', 'Rhythm guitar'],
	['lead-guitar', 'Lead guitar'],
	['vocals', 'Vocals'],
	['keys', 'Keys'],
	['violin', 'Violin'],
	['sax', 'Sax'],
	['harmonica', 'Harmonica'],
] as const;

export const GENRES = [
	['thrash', 'Thrash'],
	['death-metal', 'Death metal'],
	['black-metal', 'Black metal'],
	['heavy-metal', 'Heavy metal'],
	['doom-stoner', 'Doom / Stoner'],
	['hardcore', 'Hardcore'],
	['punk', 'Punk'],
	['grunge', 'Grunge'],
	['alt-rock', 'Alt rock'],
	['prog', 'Prog'],
	['classic-rock', 'Classic rock'],
	['blues-rock', 'Blues rock'],
	['post-rock', 'Post-rock'],
	['indie', 'Indie'],
] as const;

/** Matches the `commitment` enum in schema.ts. A ranking weight like genre,
 *  never a hard filter, and never coupled to the separate `paid` boolean. */
export const COMMITMENTS = [
	['casual', 'Casual'],
	['serious', 'Serious'],
	['professional', 'Professional'],
] as const;

/** Matches the `ad_kind` enum in schema.ts. `gig` and `rehearsal` are the
 *  same mechanism underneath (a dated, short-term ask with `event_at` set)
 *  and differ only in label; `member` is the original, undated, standing
 *  "wanted" post. */
export const AD_KINDS = [
	['member', 'Looking for a member'],
	['gig', 'One-off gig'],
	['rehearsal', 'Rehearsal / fill-in'],
] as const;

/** Matches the `link_kind` enum in schema.ts, minus `email`: that one stays
 *  the private renewal-link address, not a public contact option here. */
export const SOCIAL_KINDS = [
	['instagram', 'Instagram'],
	['facebook', 'Facebook'],
	['twitter', 'Twitter / X'],
	['tiktok', 'TikTok'],
	['youtube', 'YouTube'],
	['spotify', 'Spotify'],
	['bandcamp', 'Bandcamp'],
	['soundcloud', 'SoundCloud'],
	['website', 'Website'],
] as const;

/** Matches the `reason_known` check constraint on the `report` table.
 *  Fixed choices, no free-text-only reports: a reason you can count is
 *  worth more than a paragraph nobody reads. `detail` is optional on top. */
export const REPORT_REASONS = [
	['spam', 'Spam, or not a real band'],
	['impersonation', 'Pretending to be someone else'],
	['offensive', 'Offensive or abusive'],
	['stale', 'Already filled, or long gone'],
	['other', 'Something else'],
] as const;

export const LABEL: Record<string, string> = Object.fromEntries([
	...INSTRUMENTS,
	...GENRES,
	...COMMITMENTS,
	...SOCIAL_KINDS,
	...AD_KINDS,
	...REPORT_REASONS,
]);

/** Instrument slugs grouped for the post form's picker: you choose a family
 *  first, then the instrument inside it, so a phone shows five choices at a
 *  time instead of the whole list at once. Display grouping only, the slugs
 *  are still the same contract INSTRUMENTS defines. */
export const INSTRUMENT_CATEGORIES = [
	['strings', 'Guitars & strings', ['rhythm-guitar', 'lead-guitar', 'bass', 'violin']],
	['percussion', 'Percussion', ['drums']],
	['keys', 'Keys', ['keys']],
	['voice', 'Voice', ['vocals']],
	['wind', 'Wind', ['sax', 'harmonica']],
] as const satisfies readonly (readonly [string, string, readonly string[]])[];

/** Where each instrument's artwork lives. White-on-black silhouettes from
 *  game-icons.net (CC BY 3.0, credited in static/instruments/CREDITS.md),
 *  painted as luminance masks so every card comes out in the site's own
 *  green whatever the file holds. The harmonica is the one raster: nobody
 *  in that icon set drew one, so it is a CC0 clipart flattened to the same
 *  white-on-black convention. */
export const instrumentArt = (slug: string) =>
	slug === 'harmonica' ? '/instruments/harmonica.png' : `/instruments/${slug}.svg`;
