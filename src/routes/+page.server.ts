import type { PageServerLoad } from './$types';
import { liveAds, adCountsByCountry } from '$lib/server/queries';
import { LABEL } from '$lib/taxonomy';
import countries from '$lib/data/countries.json';

export const load: PageServerLoad = async ({ url }) => {
	const cc = (url.searchParams.get('c') ?? 'GR').toUpperCase();
	const [counts, ads] = await Promise.all([adCountsByCountry(), liveAds(cc)]);

	// ?ad= is a shared link: open that ad, and give Discord & co. its text
	// for the preview. An expired id just falls back to the plain board.
	const a = ads.find((x) => x.public_id === url.searchParams.get('ad'));
	const share = a && {
		id: a.public_id,
		kind: a.kind,
		title:
			a.kind === 'member'
				? `${a.band_name} needs ${a.needs.map((n) => LABEL[n] ?? n).join(', ')}`
				: `${a.band_name} · ${LABEL[a.kind] ?? a.kind}`,
		description: a.blurb.length > 200 ? `${a.blurb.slice(0, 199)}…` : a.blurb,
	};

	return { cc, counts, ads, countries, share };
};
