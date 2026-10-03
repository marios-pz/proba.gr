<script lang="ts">
	import Combobox from '$lib/components/Combobox.svelte';
	import MapView from '$lib/components/MapView.svelte';
	import { INSTRUMENTS, GENRES, COMMITMENTS, REPORT_REASONS, LABEL } from '$lib/taxonomy';
	import { fold } from '$lib/fuzzy';
	import { haversineKm } from '$lib/geo';
	import { position } from '$lib/position.svelte';
	import { DRAFT, readDraft, writeDraft, strings } from '$lib/session';
	import type { AdRow, Bounds } from '$lib/types';
	import { page } from '$app/state';
	import { untrack, onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Seeded from the server load, then owned by the client: switching
	// country refetches into these rather than navigating.
	let cc = $state(untrack(() => data.cc));
	let ads = $state<AdRow[]>(untrack(() => data.ads));

	const fromUrl = (key: string) =>
		untrack(() => (page.url.searchParams.get(key) ?? '').split(',').filter(Boolean));
	let inst = $state<string[]>(fromUrl('i'));
	let gen = $state<string[]>(fromUrl('g'));
	let commit = $state<string[]>(fromUrl('m'));

	type Filters = { cc: string; inst: string[]; gen: string[]; commit: string[] };

	// A URL that already carries filters (a shared link, or the old
	// /results redirect) wins over the saved session outright.
	let restored = $state(false);

	onMount(() => {
		position.request();
		const saved = page.url.searchParams.size === 0 ? readDraft<Filters>(DRAFT.filters) : null;
		if (!saved) return void (restored = true);
		const apply = () => {
			inst = strings(saved.inst);
			gen = strings(saved.gen);
			commit = strings(saved.commit);
			restored = true;
		};
		if (saved.cc && saved.cc !== cc) switchCountry(saved.cc).then(apply);
		else apply();
	});

	$effect(() => {
		if (!restored) return;
		writeDraft(DRAFT.filters, { cc, inst, gen, commit } satisfies Filters);

		const q = new URLSearchParams({ c: cc });
		if (inst.length) q.set('i', inst.join(','));
		if (gen.length) q.set('g', gen.join(','));
		if (commit.length) q.set('m', commit.join(','));
		if (selected) q.set('ad', selected);
		history.replaceState(null, '', `?${q}`);
	});

	// One sheet on a phone, the plain bar on a desktop: same markup, the
	// dialog just stops being display:none above 560px.
	let filterSheet = $state<HTMLDialogElement>();
	const picked = $derived(inst.length + gen.length + commit.length);

	const countryItems = $derived(
		data.countries
			.map((c) => ({
				id: c.c,
				label: c.n,
				sub: c.v && c.v !== c.n ? c.v : null,
				keys: c.k,
				right: data.counts[c.c] ? `<b>${data.counts[c.c]}</b> ads` : 'be the first',
			}))
			.sort((a, b) => (data.counts[b.id] ?? 0) - (data.counts[a.id] ?? 0)),
	);

	// Typed genres ("rebetiko") come lowercased and have no label; the
	// filter offers the ones posted in this country after the fixed list.
	const genreLabel = (g: string) => LABEL[g] ?? g.charAt(0).toUpperCase() + g.slice(1);
	const genreItems = $derived([
		...GENRES.map(([id, l]) => ({ id, label: l, keys: [fold(l), id] })),
		...[...new Set(ads.flatMap((a) => a.genres))]
			.filter((g) => !LABEL[g])
			.sort()
			.map((g) => ({ id: g, label: genreLabel(g), keys: [fold(g)] })),
	]);

	async function switchCountry(next: string) {
		cc = next;
		ads = await (await fetch(`/api/ads?c=${next}`)).json();
	}

	// A shared link (?ad=) opens straight onto that ad.
	let selected = $state<string | null>(untrack(() => data.share?.id ?? null));
	let hot = $state<string | null>(null);
	let zoomGated = $state(false);

	// The list follows the map, same idea as Airbnb: pins aren't filtered
	// (Leaflet already only draws what's on-screen), but the list panel is,
	// so it always matches the area currently in view rather than the
	// whole country regardless of where the map is pointed.
	let mapBounds = $state<Bounds | null>(null);
	const inView = (a: AdRow) =>
		!mapBounds ||
		(a.display_lat >= mapBounds.south &&
			a.display_lat <= mapBounds.north &&
			a.display_lng >= mapBounds.west &&
			a.display_lng <= mapBounds.east);

	// The "Search Near Me" button. locateTick is the actual trigger MapView reacts
	// to (see its own comment): a click either fires it immediately, if a
	// position is already known, or arms wantsLocate so the effect below
	// fires it the moment geolocation resolves instead of silently doing
	// nothing on a cold, not-yet-answered permission prompt.
	let locateTick = $state(0);
	let wantsLocate = $state(false);
	let locateAttempted = $state(false);
	function searchNearMe() {
		locateAttempted = true;
		position.request();
		if (position.coords) locateTick++;
		else wantsLocate = true;
	}
	$effect(() => {
		if (wantsLocate && position.coords) {
			wantsLocate = false;
			locateTick++;
		}
	});

	// Recruit (standing member posts) is the board's original purpose and
	// stays the default; Gigs is the opt-in, mutually exclusive view. Not
	// persisted across visits, same as `selected`: a fresh visit always
	// starts on Recruit.
	let view = $state<'gigs' | 'recruit'>(
		untrack(() => (data.share && data.share.kind !== 'member' ? 'gigs' : 'recruit')),
	);
	const showGigs = $derived(view === 'gigs');

	const OFFSCREEN = 'in this part of the map. Pan or zoom out to see more.';
	const EMPTY = {
		gigs: { none: 'No gigs posted yet.', offscreen: `No gigs ${OFFSCREEN}` },
		recruit: {
			none: 'No open spots yet. Be the first to post one.',
			offscreen: `No open spots ${OFFSCREEN}`,
		},
	};
	const empty = $derived(EMPTY[view]);

	const distanceKm = (a: AdRow) => {
		const p = position.coords;
		return p ? haversineKm(p, { lat: a.display_lat, lng: a.display_lng }) : null;
	};
	const distanceLabel = (a: AdRow) => {
		const km = distanceKm(a);
		return km === null ? null : `${Math.round(km)} km away`;
	};

	// Replaces the old same-region bonus: a smooth falloff (halves every
	// 50km, same peak weight the region bonus had at 0km) rather than a
	// hard in/out bucket. Drops out entirely, never a filter, when
	// geolocation is denied or unavailable; the board stays fully usable.
	//
	// commitment is its own independent signal, same weight class as a
	// single genre match, never coupled to `paid`, which stays its own
	// untouched boolean throughout.
	const DISTANCE_MAX = 24,
		DISTANCE_HALFLIFE_KM = 50;
	function score(a: AdRow): number {
		const km = distanceKm(a);
		return (
			(a.needs.some((n) => inst.includes(n)) ? 46 : 0) +
			20 * a.genres.filter((g) => gen.includes(g)).length +
			(km === null ? 0 : DISTANCE_MAX * Math.pow(2, -km / DISTANCE_HALFLIFE_KM)) +
			(commit.includes(a.commitment) ? 15 : 0)
		);
	}

	// A gig or a rehearsal is a dated, short-term ask, so it sorts by
	// soonest first rather than by relevance score: a plausible-but-distant
	// match is less useful than an exact one an hour before it starts.
	// "Looking for a member" ads have no date and keep the original ranking.
	const soonest = (x: AdRow, y: AdRow) =>
		new Date(x.event_at ?? 0).getTime() - new Date(y.event_at ?? 0).getTime();

	// Pins stay the full set for the current view; the list additionally
	// narrows to what the map is actually showing.
	const visible = $derived(
		showGigs
			? ads.filter((a) => a.kind !== 'member').sort(soonest)
			: ads.filter((a) => a.kind === 'member').sort((x, y) => score(y) - score(x)),
	);
	const visibleInView = $derived(visible.filter(inView));

	// The pin says who, not what: an ad can be short a drummer, a bass and
	// a singer at once, and one of the three on the pin was a coin toss.
	const pins = $derived(
		visible.map((a) => ({
			id: a.public_id,
			lat: a.display_lat,
			lng: a.display_lng,
			paid: a.paid,
			label: a.band_name,
		})),
	);

	function formatEventAt(iso: string): string {
		const d = new Date(iso);
		const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
		const dayDiff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
		if (dayDiff === 0) return `Today, ${time}`;
		if (dayDiff === 1) return `Tomorrow, ${time}`;
		return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
	}

	const open = $derived(ads.find((a) => a.public_id === selected));
	const pick = (id: string) => (selected = selected === id ? null : id);

	// The server is the one actually counting (see /api/ads/[id]/view and
	// record_ad_view()), so this only needs to fire once per ad per page
	// load. Refresh-spam and repeat clicks are already absorbed server-side
	// by a per-viewer window; this set just skips the redundant request.
	const viewOverrides = $state<Record<string, number>>({});
	const viewsOf = (a: AdRow) => viewOverrides[a.public_id] ?? a.view_count;
	const seenViews = new Set<string>();
	$effect(() => {
		const id = selected;
		if (!id || seenViews.has(id)) return;
		seenViews.add(id);
		fetch(`/api/ads/${id}/view`, { method: 'POST' })
			.then((r) => (r.ok ? r.json() : null))
			.then((res) => {
				if (res?.view_count != null) viewOverrides[id] = res.view_count;
			})
			.catch(() => {
				/* a missed view count is not worth surfacing an error for */
			});
	});

	// Reporting. Anyone can post an ad pointing at someone else's Instagram,
	// and with no accounts there is nothing to ban, so the flag plus the 14
	// day expiry are the whole defence. The server absorbs repeat clicks
	// from the same reporter (see report_ad()), so this stays dumb.
	let reportDialog = $state<HTMLDialogElement>();
	let reporting = $state<AdRow | null>(null);
	let reportReason = $state<string>(REPORT_REASONS[0][0]);
	let reportDetail = $state('');
	let reportState = $state<'form' | 'sending' | 'done' | 'failed'>('form');

	function openReport(a: AdRow) {
		reporting = a;
		reportReason = REPORT_REASONS[0][0];
		reportDetail = '';
		reportState = 'form';
		reportDialog?.showModal();
	}

	async function sendReport() {
		if (!reporting) return;
		reportState = 'sending';
		try {
			const r = await fetch(`/api/ads/${reporting.public_id}/report`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ reason: reportReason, detail: reportDetail }),
			});
			// A wrong id and an already-reported ad both answer 202: the
			// clicker learns nothing either way, which is the point.
			reportState = r.ok ? 'done' : 'failed';
		} catch {
			reportState = 'failed';
		}
	}

	// Links are stored as whatever URL the poster pasted; only missing the
	// scheme gets fixed up, nothing else about the link is second-guessed.
	const toHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

	// The phone's own share sheet where there is one, otherwise copy the
	// link. Desktop gets the copy too: there you want to paste it into
	// Discord, not open the OS sheet.
	let copied = $state(false);
	async function shareAd(a: AdRow) {
		const url = `${location.origin}/?c=${a.country_code}&ad=${a.public_id}`;
		if (navigator.share && matchMedia('(pointer: coarse)').matches) {
			await navigator.share({ title: a.band_name, url }).catch(() => {});
			return;
		}
		await navigator.clipboard.writeText(url);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

	// Opens the pin in a maps app. Deliberately the display position, not
	// the real one: exact lat/lng and the street address never leave the
	// server, so this lands within ~700m of the room, same as the pin.
	// It is "which part of town is this", not turn-by-turn to the door.
	//
	// One https Google Maps URL rather than branching on platform. Android
	// and iOS both hand this to the installed Maps app through their own
	// app-link handling, and it still works on a desktop browser, where a
	// geo: URI would do nothing.
	const mapsUrl = (a: AdRow) =>
		`https://www.google.com/maps/search/?api=1&query=${a.display_lat},${a.display_lng}`;
</script>

{#snippet views(a: AdRow)}
	<span class="views" title={plural(viewsOf(a), 'view')}>
		<svg
			viewBox="0 0 24 24"
			width="11"
			height="11"
			fill="none"
			stroke="currentColor"
			stroke-width="2.2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
			<circle cx="12" cy="12" r="3" />
		</svg>{viewsOf(a)}
	</span>
{/snippet}

{#snippet tags(a: AdRow, withGenres: boolean)}
	<div class="row">
		{#each a.needs as n}<span class="tag" class:hit={inst.includes(n)}>Needs {LABEL[n] ?? n}</span
			>{/each}
		{#if withGenres}
			{#each a.genres as g}<span class="tag" class:hit={gen.includes(g)}>{genreLabel(g)}</span
				>{/each}
		{/if}
	</div>
{/snippet}

{#snippet flag(a: AdRow)}
	<button
		type="button"
		class="flag"
		title="Report this ad"
		aria-label="Report {a.band_name}"
		onclick={() => openReport(a)}>!</button
	>
{/snippet}

{#snippet gigCard(a: AdRow)}
	<div class="cardwrap">
		<button
			class="card gigcard"
			class:on={selected === a.public_id}
			onclick={() => pick(a.public_id)}
		>
			<div class="gigwhen">{formatEventAt(a.event_at ?? '')}</div>
			<h3>{a.band_name}</h3>
			{@render views(a)}
			<div class="meta">
				{LABEL[a.kind]}{#if distanceLabel(a)}
					· {distanceLabel(a)}{/if}
			</div>
			{@render tags(a, false)}
		</button>
		{@render flag(a)}
	</div>
{/snippet}

{#snippet adCard(a: AdRow)}
	<div class="cardwrap">
		<button
			class="card"
			class:on={selected === a.public_id}
			onclick={() => pick(a.public_id)}
			onpointerenter={() => (hot = a.public_id)}
			onpointerleave={() => (hot = null)}
		>
			<h3>{a.band_name}</h3>
			<span class="lvl" class:hit={commit.includes(a.commitment)}>{a.commitment}</span>
			{@render views(a)}
			<div class="meta">
				{#if distanceLabel(a)}{distanceLabel(a)} ·
				{/if}
				{#if a.paid}<span class="paid">Paid</span> ·
				{/if}
				<span class="expiry" class:soon={a.days_left <= 3}>{a.days_left}d left</span>
			</div>
			{@render tags(a, true)}
		</button>
		{@render flag(a)}
	</div>
{/snippet}

<button class="filterbtn" type="button" onclick={() => filterSheet?.showModal()}>
	<span>Filters</span>
	{#if picked}<span class="filtern">{picked} on</span>{:else}<span class="filtern">all ads</span
		>{/if}
</button>

<dialog bind:this={filterSheet} class="board controls filtersheet veil">
	<div class="filterbar">
		<div class="filtercol">
			<label for="country">Country</label>
			<Combobox
				items={countryItems}
				value={cc}
				flag
				label="Country"
				placeholder="Greece"
				group="Where bands are posting"
				noMatch="No country matches. Try the local spelling."
				onchange={(v) => v && switchCountry(v as string)}
			/>
		</div>
		<div class="filtercol">
			<label for="instruments">I play</label>
			<Combobox
				items={INSTRUMENTS.map(([id, l]) => ({ id, label: l, keys: [fold(l), id] }))}
				bind:value={inst}
				multi
				label="Instruments"
				placeholder="Drums"
				group="Instruments"
				noMatch="No instrument matches. Try a shorter word."
			/>
		</div>
		<div class="filtercol">
			<label for="genres">Genre</label>
			<Combobox
				items={genreItems}
				bind:value={gen}
				multi
				label="Genres"
				placeholder="Doom"
				group="Genres"
				noMatch="No genre matches that."
			/>
		</div>
		<div class="filtercol">
			<label for="commitment">How serious</label>
			<Combobox
				items={COMMITMENTS.map(([id, l]) => ({ id, label: l, keys: [fold(l), id] }))}
				bind:value={commit}
				multi
				label="Commitment"
				placeholder="Serious"
				group="Commitment"
				noMatch="No match for that."
			/>
		</div>
	</div>
	<button class="go sheetdone" type="button" onclick={() => filterSheet?.close()}>Show ads</button>
</dialog>

<!-- Two separate panels with air between them, not one box holding both.
     The view toggle lives in the list's own header rather than floating
     above the pair: it only ever changes what the list is made of. -->
<div class="split">
	<section class="board listboard veil">
		<header class="boardhead">
			<p class="count">{plural(visibleInView.length, 'ad')} in view</p>
			<div class="switch">
				<button type="button" class="switchbtn" class:on={showGigs} onclick={() => (view = 'gigs')}
					>Gigs</button
				>
				<button
					type="button"
					class="switchbtn"
					class:on={!showGigs}
					onclick={() => (view = 'recruit')}>Recruit</button
				>
			</div>
		</header>
		<div class="list">
			{#if zoomGated}
				<p class="hint">Zoom in to see ads there.</p>
			{:else}
				{#each visibleInView as a (a.public_id)}
					{#if showGigs}{@render gigCard(a)}{:else}{@render adCard(a)}{/if}
				{/each}
				{#if !visible.length}
					<p class="hint">{empty.none}</p>
				{:else if !visibleInView.length}
					<p class="hint">{empty.offscreen}</p>
				{/if}
			{/if}
		</div>
	</section>

	<section class="board mapboard veil">
		<MapView
			{pins}
			bind:selected
			{hot}
			minZoom={8}
			meCoords={position.coords}
			{locateTick}
			onzoomgate={(g) => (zoomGated = g)}
			onbounds={(b) => (mapBounds = b)}
		/>
		<p class="hint maphint">Tap a card or a pin to open the full ad.</p>
		<button type="button" class="nearme" onclick={searchNearMe}>
			<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
				<path
					d="M12 2C7.58 2 4 5.58 4 10c0 5.25 7 12 8 12s8-6.75 8-12c0-4.42-3.58-8-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
				/>
			</svg>
			Search Near Me
		</button>
		{#if locateAttempted && position.status === 'denied'}
			<p class="hint locerr">Location access was denied.</p>
		{/if}
	</section>
</div>

{#if open}
	<div class="board detail veil">
		<div class="detailhead">
			<h2>{open.band_name}</h2>
			{@render views(open)}
		</div>
		<div class="meta">
			{#if open.kind !== 'member' && open.event_at}
				<span style="color:var(--marker)">{formatEventAt(open.event_at)}</span> · {LABEL[open.kind]}
			{:else}
				{open.commitment}{#if open.paid}
					· <span class="paid">Paid</span>{/if}
			{/if}
			{#if distanceLabel(open)}
				· {distanceLabel(open)}{/if}
		</div>
		<p class="note">{open.blurb}</p>
		{@render tags(open, true)}
		<div class="row" style="margin-top:10px">
			{#each open.links as l}
				<a
					class="social"
					href={toHref(l.handle)}
					target="_blank"
					rel="noopener noreferrer nofollow"
				>
					Message on {l.kind} &rarr;
				</a>
			{/each}
			<a class="social maplink" href={mapsUrl(open)} target="_blank" rel="noopener noreferrer">
				<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
					<path
						d="M12 2C7.58 2 4 5.58 4 10c0 5.25 7 12 8 12s8-6.75 8-12c0-4.42-3.58-8-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
					/>
				</svg>
				Location &rarr;
			</a>
			<button type="button" class="social" onclick={() => open && shareAd(open)}>
				{copied ? 'Link copied' : 'Share'}
			</button>
		</div>
		<p class="hint" style="margin-top:10px">
			Talk to them on their socials. The ad comes down in {plural(open.days_left, 'day')}
			unless they renew, and the pin is good to about 700m, not to the door.
		</p>
		<button type="button" class="reportlink" onclick={() => open && openReport(open)}>
			Report this ad
		</button>
	</div>
{/if}

<dialog bind:this={reportDialog} class="reportbox" onclose={() => (reporting = null)}>
	{#if reportState === 'done'}
		<p class="lab">Thanks</p>
		<p class="hint">Logged. Nothing happens automatically, a person reads it.</p>
		<button type="button" class="go" onclick={() => reportDialog?.close()}>Close</button>
	{:else}
		<p class="lab">Report {reporting?.band_name ?? 'this ad'}</p>
		<p class="hint">Nobody is told who reported it. Pick the closest reason.</p>

		<div class="radiorow">
			{#each REPORT_REASONS as [id, l]}
				<label class="radiopill" class:on={reportReason === id}>
					<input type="radio" name="reason" value={id} bind:group={reportReason} />
					{l}
				</label>
			{/each}
		</div>

		<label for="report_detail" class="fieldname" style="margin-top:12px">Anything to add</label>
		<textarea
			id="report_detail"
			rows="3"
			maxlength="600"
			bind:value={reportDetail}
			placeholder="Optional. A link or a name, so it can be checked."></textarea>

		{#if reportState === 'failed'}
			<p class="err">That did not go through. Check your connection and try again.</p>
		{/if}

		<div class="row" style="gap:10px;margin-top:14px">
			<button type="button" class="go" onclick={sendReport} disabled={reportState === 'sending'}>
				{reportState === 'sending' ? 'Sending' : 'Send report'}
			</button>
			<button type="button" class="ghost" onclick={() => reportDialog?.close()}>Cancel</button>
		</div>
	{/if}
</dialog>
