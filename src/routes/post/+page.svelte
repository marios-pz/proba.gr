<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Combobox from '$lib/components/Combobox.svelte';
	import MapView from '$lib/components/MapView.svelte';
	import {
		GENRES,
		COMMITMENTS,
		SOCIAL_KINDS,
		AD_KINDS,
		INSTRUMENT_CATEGORIES,
		instrumentArt,
		LABEL,
	} from '$lib/taxonomy';
	import { DRAFT, readDraft, writeDraft, clearDraft, strings } from '$lib/session';
	import { position } from '$lib/position.svelte';
	import type { LatLng } from '$lib/types';
	import { onMount, untrack } from 'svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Set when this is /post?edit=…&token=… from /manage: the same form,
	// filled in with the ad, saving over it instead of posting a new one.
	const editing = untrack(() => data.editing);

	let cc = $state('GR');
	let pin = $state<LatLng | null>(null);
	let bandName = $state('');
	let blurb = $state('');
	let address = $state('');
	// The families are tabs, and inside the open one you tick as many
	// instruments as the band is short. Nine cards at once was the thing
	// that made this a wall on a phone; a tab at a time is four or five.
	let cat = $state<string>(INSTRUMENT_CATEGORIES[0][0]);
	let inst = $state<string[]>([]);
	const members = $derived(INSTRUMENT_CATEGORIES.find(([id]) => id === cat)?.[2] ?? []);
	const toggle = (id: string) =>
		(inst = inst.includes(id) ? inst.filter((x) => x !== id) : [...inst, id]);
	/** How many picks a family holds, so a tab you have already filled stays
	 *  marked once you move on to the next one. */
	const picksIn = (ids: readonly string[]) => ids.filter((x) => inst.includes(x)).length;
	let gen = $state<string[]>([]);
	let customGen = $state('');
	let commitment = $state<string>('casual');
	let kind = $state<string>('member');
	// A bare datetime-local value ("2026-09-10T19:00") has no timezone, so
	// it's converted to a real ISO instant right here, in the browser,
	// using the browser's own timezone (the poster's). The hidden field
	// actually submitted carries that ISO string, not the raw input value.
	let eventAtLocal = $state('');
	const eventAtIso = $derived(eventAtLocal ? new Date(eventAtLocal).toISOString() : '');
	let paid = $state(false);
	let socialKinds = $state<string[]>([]);
	let socialLinks = $state<Record<string, string>>({});
	let email = $state('');

	const socialsReady = $derived(socialKinds.some((k) => socialLinks[k]?.trim()));

	/* ---- the wizard ----------------------------------------------------
	   One form, four panels. Everything the server reads is emitted from a
	   single hidden block that is always in the DOM, because a panel behind
	   an {#if} takes its inputs with it and those values would never post. */

	const STEPS = ['Looking for', 'Band', 'Location', 'Contact'] as const;
	const LAST = STEPS.length - 1;
	let stepIx = $state(0);

	// What each panel is still short of, in the order it asks for it.
	const gaps = $derived([
		[
			...(kind !== 'member' && !eventAtLocal ? ['the date'] : []),
			...(inst.length ? [] : ['at least one instrument']),
		],
		bandName ? [] : ['the band name'],
		pin ? [] : ['the map pin'],
		[...(socialsReady ? [] : ['a contact link']), ...(email || editing ? [] : ['your email'])],
	]);
	const filled = $derived(gaps.map((g) => g.length === 0));
	const ready = $derived(filled.every(Boolean));
	const here = $derived(gaps[stepIx]);

	function go(i: number) {
		stepIx = Math.max(0, Math.min(LAST, i));
		scrollTo({ top: 0, behavior: 'smooth' });
	}

	// Enter inside a text field submits a form by default, which on step 1
	// would post a half-written ad. enhance preventDefaults before calling
	// this, so cancelling here is enough to stop every early submit.
	const submit: SubmitFunction = ({ cancel }) => {
		if (stepIx !== LAST || !ready) cancel();
	};

	// A half-written ad is real work too, same reasoning as the board's
	// filters: session-only, and cleared the moment a submission actually
	// goes through so the next visit starts blank.
	type Draft = {
		cc: string;
		pin: LatLng | null;
		bandName: string;
		blurb: string;
		address: string;
		inst: string[];
		gen: string[];
		customGen: string;
		commitment: string;
		kind: string;
		eventAtLocal: string;
		paid: boolean;
		socialKinds: string[];
		socialLinks: Record<string, string>;
		email: string;
	};
	let restored = $state(false);

	// Centring the picker on the poster, once. A pin drop starts on a map
	// of the whole world, which on a phone means pinch-zooming down from
	// orbit to find your own street before you can even place it.
	let locateTick = $state(0);
	let centred = false;
	$effect(() => {
		// Never once a pin exists: flying the map then would yank it out
		// from under someone adjusting the pin they just placed, and a
		// restored draft already has one.
		if (!restored || centred || pin || !position.coords) return;
		centred = true;
		locateTick++;
	});

	// datetime-local wants the poster's local wall-clock time, no zone.
	const localInput = (iso: string | null) => {
		if (!iso) return '';
		const d = new Date(iso);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
	};

	onMount(() => {
		position.request();
		if (editing) {
			cc = editing.country_code;
			pin = { lat: editing.lat, lng: editing.lng };
			bandName = editing.band_name;
			blurb = editing.blurb;
			address = editing.address ?? '';
			commitment = editing.commitment;
			kind = editing.kind;
			eventAtLocal = localInput(editing.event_at);
			paid = editing.paid;
			inst = editing.roles.filter((r) => !r.filled).map((r) => r.instrument);
			gen = editing.genres;
			customGen = editing.custom_genres.join(', ');
			socialKinds = editing.links.map((l) => l.kind);
			socialLinks = Object.fromEntries(editing.links.map((l) => [l.kind, l.handle]));
			restored = true;
			return;
		}
		const saved = readDraft<Draft>(DRAFT.post);
		if (saved) {
			cc = saved.cc ?? cc;
			pin = saved.pin ?? null;
			bandName = saved.bandName ?? '';
			blurb = saved.blurb ?? '';
			address = saved.address ?? '';
			commitment = saved.commitment ?? 'casual';
			kind = saved.kind ?? 'member';
			eventAtLocal = saved.eventAtLocal ?? '';
			paid = !!saved.paid;
			inst = strings(saved.inst);
			gen = strings(saved.gen);
			customGen = saved.customGen ?? '';
			socialKinds = strings(saved.socialKinds);
			socialLinks = saved.socialLinks ?? {};
			email = saved.email ?? '';
		}
		restored = true;
	});

	$effect(() => {
		if (!restored || editing) return;
		writeDraft(DRAFT.post, {
			cc,
			pin,
			bandName,
			blurb,
			address,
			inst,
			gen,
			customGen,
			commitment,
			kind,
			eventAtLocal,
			paid,
			socialKinds,
			socialLinks,
			email,
		} satisfies Draft);
	});

	$effect(() => {
		if (form?.posted) clearDraft(DRAFT.post);
	});

	const countryItems = $derived(
		data.countries.map((c) => ({
			id: c.c,
			label: c.n,
			sub: c.v && c.v !== c.n ? c.v : null,
			keys: c.k,
		})),
	);
</script>

<svelte:head>
	{#if editing}
		<!-- The token is in this page's URL; keep it out of Referer headers. -->
		<meta name="referrer" content="no-referrer" />
	{/if}
</svelte:head>

{#if data.badEdit}
	<div class="form step veil">
		<p class="lab">Edit an ad</p>
		<p class="err">This edit link is invalid, or the ad has been deleted.</p>
		<a class="social" href="/manage">Manage an ad</a>
	</div>
{:else if form?.edited && editing}
	<div class="form step veil">
		<div class="tokenbox">
			<h2>Saved</h2>
			<p style="font-size:13px;margin:0">{form.bandName} is updated on the board.</p>
			<a class="social" href="/manage?id={editing.public_id}&token={editing.token}"
				>Back to your ad</a
			>
		</div>
	</div>
{:else if form?.posted}
	<div class="form step veil">
		<div class="tokenbox">
			<h2>Check your email</h2>
			<p style="font-size:13px;margin:0">
				A confirm link just went to <b>{form.email}</b>. Click it and {form.bandName} goes live.
			</p>
			<p class="hint" style="margin-top:12px">
				Once it's live, a second email brings the link to renew, edit or delete it. It's only sent
				once, so keep it.
			</p>
			<a class="social" href="/post">Post another</a>
		</div>
	</div>
{:else}
	<form class="form postform step veil" method="POST" use:enhance={submit}>
		{#if stepIx === 0}
			<fieldset class="sect">
				<legend class="secthead">I am looking for</legend>
				<div class="chips">
					{#each AD_KINDS as [id, l]}
						<label class="chip" class:on={kind === id}>
							<input type="radio" value={id} bind:group={kind} />
							{l}
						</label>
					{/each}
				</div>

				{#if kind !== 'member'}
					<label for="event_at">
						{kind === 'gig' ? 'When the gig is' : 'When the rehearsal is'}<span class="req">*</span>
					</label>
					<input id="event_at" type="datetime-local" bind:value={eventAtLocal} />
				{/if}
			</fieldset>

			<fieldset class="sect">
				<legend class="secthead">Select your instruments<span class="req">*</span></legend>
				<p class="hint starnote">A star means we cannot post the ad without it.</p>

				<div class="cats">
					{#each INSTRUMENT_CATEGORIES as [id, l, ids]}
						{@const n = picksIn(ids)}
						<!-- A family you have already picked from stays lit after you
						     move to another tab, so what you filled is visible from
						     wherever you are rather than only while it is open. -->
						<button
							class="cat"
							class:on={cat === id}
							class:filled={n > 0}
							type="button"
							aria-pressed={cat === id}
							onclick={() => (cat = id)}
						>
							{l}{#if n}<span class="catn">{n}</span>{/if}
						</button>
					{/each}
				</div>

				<!-- A scroll-snap rail: on a phone it swipes, on a wide screen the
				     same markup lays itself out as a grid. No carousel script, no
				     drag handlers, no library. -->
				<div class="rail">
					{#each members as id (id)}
						<label class="icard" class:on={inst.includes(id)}>
							<input type="checkbox" checked={inst.includes(id)} onchange={() => toggle(id)} />
							<span class="iart" style="--art: url('{instrumentArt(id)}')"></span>
							<span class="iname">{LABEL[id]}</span>
						</label>
					{/each}
				</div>

				<p class="picked">
					{#if inst.length}Wanted: {inst.map((id) => LABEL[id]).join(', ')}
					{:else}Nothing picked yet.{/if}
				</p>

				<div class="chips" style="margin-top:16px">
					<label class="chip paidchip" class:on={paid}>
						<input type="checkbox" bind:checked={paid} />
						Paid position
					</label>
				</div>
			</fieldset>
		{:else if stepIx === 1}
			<fieldset class="sect">
				<legend class="secthead">Band</legend>

				<label for="band_name">Band name<span class="req">*</span></label>
				<input
					id="band_name"
					type="text"
					maxlength="80"
					bind:value={bandName}
					placeholder="Rust Verdict"
				/>

				<label for="blurb">What you are looking for</label>
				<textarea
					id="blurb"
					maxlength="600"
					rows="4"
					bind:value={blurb}
					placeholder="Twice a week in Gazi, gigs by spring. Sabbath and Kyuss, not shred."
				></textarea>

				<p class="fieldname">Genre</p>
				<div class="chips">
					{#each GENRES as [id, l]}
						<label class="chip" class:on={gen.includes(id)}>
							<input type="checkbox" value={id} bind:group={gen} />
							{l}
						</label>
					{/each}
				</div>

				<label for="custom_genres">Other genres</label>
				<input
					id="custom_genres"
					type="text"
					maxlength="100"
					bind:value={customGen}
					placeholder="Rebetiko, surf rock"
				/>
				<p class="hint">Not in the list? Type up to 3, separated by commas.</p>

				<p class="fieldname">How serious</p>
				<div class="chips">
					{#each COMMITMENTS as [id, l]}
						<label class="chip" class:on={commitment === id}>
							<input type="radio" value={id} bind:group={commitment} />
							{l}
						</label>
					{/each}
				</div>
			</fieldset>
		{:else if stepIx === 2}
			<fieldset class="sect">
				<legend class="secthead">Location</legend>

				<label for="country">Country</label>
				<Combobox
					items={countryItems}
					bind:value={cc}
					flag
					label="Country"
					placeholder="Greece"
					group="Countries"
				/>

				<label for="address">Rehearsal room or studio address</label>
				<input
					id="address"
					type="text"
					bind:value={address}
					placeholder="Kallidromiou 42, Exarchia"
				/>

				<p class="fieldname">
					Drop the pin<span class="req">*</span>{#if pin}<span class="done">placed</span>{/if}
				</p>
				<MapView
					pickable
					picked={pin}
					onpick={(p) => (pin = p)}
					meCoords={position.coords}
					{locateTick}
				/>
				<p class="hint" style="margin-top:8px">The public map shifts this by up to 700m.</p>
			</fieldset>
		{:else}
			<fieldset class="sect">
				<legend class="secthead">Contact</legend>

				<p class="fieldname">Where they reach you<span class="req">*</span></p>
				<div class="chips">
					{#each SOCIAL_KINDS as [id, l]}
						<label class="chip" class:on={socialKinds.includes(id)}>
							<input type="checkbox" value={id} bind:group={socialKinds} />
							{l}
						</label>
					{/each}
				</div>

				{#each socialKinds as k (k)}
					<label for="social-{k}">{SOCIAL_KINDS.find(([id]) => id === k)?.[1] ?? k} link</label>
					<input
						id="social-{k}"
						type="url"
						inputmode="url"
						autocapitalize="off"
						autocorrect="off"
						spellcheck="false"
						value={socialLinks[k] ?? ''}
						oninput={(e) => (socialLinks[k] = e.currentTarget.value)}
						placeholder="https://{k}.com/yourband"
					/>
				{/each}

				{#if !editing}
					<label for="email">Email, only for the renewal link<span class="req">*</span></label>
					<input
						id="email"
						type="email"
						inputmode="email"
						autocapitalize="off"
						autocorrect="off"
						spellcheck="false"
						bind:value={email}
						placeholder="you@example.com"
					/>
				{/if}
			</fieldset>
		{/if}

		<!-- Every field the action reads, in one block that is never behind a
		     step conditional. The visible controls above carry no `name` at
		     all: they bind state, and this posts it. -->
		<input type="hidden" name="kind" value={kind} />
		<input type="hidden" name="event_at" value={kind !== 'member' ? eventAtIso : ''} />
		<input type="hidden" name="band_name" value={bandName} />
		<input type="hidden" name="blurb" value={blurb} />
		<input type="hidden" name="commitment" value={commitment} />
		<input type="hidden" name="country" value={cc} />
		<input type="hidden" name="address" value={address} />
		<input type="hidden" name="pin_lat" value={pin?.lat ?? ''} />
		<input type="hidden" name="pin_lng" value={pin?.lng ?? ''} />
		<input type="hidden" name="email" value={email} />
		{#if editing}
			<input type="hidden" name="edit_id" value={editing.public_id} />
			<input type="hidden" name="edit_token" value={editing.token} />
		{/if}
		{#if paid}<input type="hidden" name="paid" value="on" />{/if}
		{#each inst as id}<input type="hidden" name="instrument" value={id} />{/each}
		{#each gen as id}<input type="hidden" name="genre" value={id} />{/each}
		<input type="hidden" name="custom_genres" value={customGen} />
		<!-- Emitted as a pair inside one loop: the server zips these two by
		     index, so they have to stay in lockstep. -->
		{#each socialKinds as k (k)}
			<input type="hidden" name="social_kind" value={k} />
			<input type="hidden" name="social_url" value={socialLinks[k] ?? ''} />
		{/each}

		{#if form?.error}<p class="err">{form.error}</p>{/if}

		<!-- Consent without a checkbox: the terms are one tap away and the
		     act of sending is the agreement, which is all a free board with
		     no account needs. -->
		{#if stepIx === LAST && !editing}
			<p class="hint">Sending means you agree to the <a href="/terms">terms</a>.</p>
		{/if}

		<!-- Back on the left, forward on the right, nothing in between but
		     what the panel is still short of. -->
		<div class="submitbar">
			{#if stepIx > 0}
				<button class="back" type="button" onclick={() => go(stepIx - 1)}>Back</button>
			{/if}
			<p class="missing">
				{#if here.length}Needs {here[0]}{#if here.length > 1}, and {here.length - 1} more{/if}.
				{:else if stepIx === LAST}Ready to {editing ? 'save' : 'post'}.
				{:else}Done.{/if}
			</p>
			{#if stepIx < LAST}
				<button class="go" type="button" onclick={() => go(stepIx + 1)}>Continue</button>
			{:else}
				<button class="go" type="submit" disabled={!ready}
					>{editing ? 'Save changes' : 'Send'}</button
				>
			{/if}
		</div>
	</form>
{/if}
