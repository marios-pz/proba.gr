/**
 * The shapes that cross the server/client boundary. They live here, not in
 * `$lib/server/queries.ts`, because the board, the map and the ranking all
 * need them and nothing under `$lib/server/` may be imported from a
 * component. Field names are snake_case throughout: these come back from
 * Postgres and go out as JSON unchanged, so renaming them would mean a
 * mapping layer that buys nothing.
 */

export type AdKind = 'member' | 'gig' | 'rehearsal';
export type Commitment = 'casual' | 'serious' | 'professional';

export type AdLink = { kind: string; handle: string };

/** One live ad, exactly as `/api/ads` and the home page load return it. */
export type AdRow = {
	public_id: string;
	band_name: string;
	blurb: string;
	country_code: string;
	display_lat: number;
	display_lng: number;
	commitment: Commitment;
	kind: AdKind;
	event_at: string | null;
	paid: boolean;
	days_left: number;
	view_count: number;
	needs: string[];
	genres: string[];
	links: AdLink[];
};

/** A row of `src/lib/data/countries.json`. Keys are one letter to keep the
 *  file small: it ships whole to every visitor. */
export type Country = {
	/** ISO 3166-1 alpha-2 code. */
	c: string;
	/** English name. */
	n: string;
	/** Local-language name, if it differs from `n`. */
	v?: string;
	/** UN region. */
	r?: string;
	/** Search keys, pre-folded, for the combobox scorer. */
	k: string[];
};

export type LatLng = { lat: number; lng: number };

export type Bounds = { south: number; west: number; north: number; east: number };
