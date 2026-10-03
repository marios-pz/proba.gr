<script lang="ts">
	import { enhance } from '$app/forms';
	import { LABEL } from '$lib/taxonomy';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();

	const day = (iso: string) =>
		new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
	const open = $derived(data.ad?.roles.filter((r) => !r.filled) ?? []);
	const expired = $derived(!!data.ad && new Date(data.ad.expires_at) < new Date());
</script>

<svelte:head>
	<title>Manage your ad · Proba</title>
	<!-- The token is in this page's URL; keep it out of Referer headers. -->
	<meta name="referrer" content="no-referrer" />
</svelte:head>

{#if form?.deleted}
	<div class="form step veil">
		<div class="tokenbox">
			<h2>Deleted</h2>
			<p style="font-size:13px;margin:0">
				{form.bandName} is off the board and out of the database. Nothing is kept.
			</p>
			<a class="social" href="/post">Post a new ad</a>
		</div>
	</div>
{:else if data.ad}
	{@const ad = data.ad}
	<div class="form step veil manage">
		<p class="lab">{ad.band_name}</p>
		<p class="hint">
			Ad code {ad.public_id} ·
			{#if expired}<b class="soon">expired, renew to bring it back</b>
			{:else}up until {day(ad.expires_at)}{/if}
		</p>

		{#if form?.renewed}<p class="okline">Renewed. It's up for another 14 days from today.</p>{/if}
		{#if form?.filled}<p class="okline">Done, that one is off the ad.</p>{/if}
		{#if form?.error}<p class="err">{form.error}</p>{/if}

		<p class="fieldname">Renew</p>
		<form method="POST" action="?/renew" use:enhance>
			<input type="hidden" name="id" value={data.id} />
			<input type="hidden" name="token" value={data.token} />
			<button class="go" type="submit">Keep it up 14 more days</button>
		</form>
		<p class="hint">Counts from today, so renewing early doesn't add up.</p>

		<p class="fieldname">Found someone?</p>
		{#if open.length}
			<div class="row" style="gap:10px">
				{#each open as r (r.instrument)}
					<form method="POST" action="?/fill" use:enhance>
						<input type="hidden" name="id" value={data.id} />
						<input type="hidden" name="token" value={data.token} />
						<input type="hidden" name="instrument" value={r.instrument} />
						<button class="ghost" type="submit"
							>Found a {LABEL[r.instrument] ?? r.instrument}</button
						>
					</form>
				{/each}
			</div>
			<p class="hint">Takes that instrument off the ad. The rest stays up.</p>
		{:else}
			<p class="hint">Every spot is filled. If you're done, delete the ad below.</p>
		{/if}

		<p class="fieldname">Edit</p>
		<a class="social" href="/post?edit={data.id}&token={encodeURIComponent(data.token)}"
			>Change text, instruments, genres, location or links</a
		>

		<p class="fieldname">Delete</p>
		<form
			method="POST"
			action="?/delete"
			use:enhance
			onsubmit={(e) => {
				if (!confirm(`Delete ${ad.band_name} for good?`)) e.preventDefault();
			}}
		>
			<input type="hidden" name="id" value={data.id} />
			<input type="hidden" name="token" value={data.token} />
			<input type="hidden" name="band_name" value={ad.band_name} />
			<button class="ghost danger" type="submit">Delete the ad</button>
		</form>
		<p class="hint">Gone right away, and it can't be undone.</p>
	</div>
{:else}
	<form class="form step veil" method="GET" action="/manage">
		<p class="lab">Manage your ad</p>
		<p class="hint">
			The link in the email you got when the ad went live opens this page directly. Or type the code
			and token from that email.
		</p>

		<label for="id">Ad code</label>
		<input id="id" name="id" type="text" value={data.id} placeholder="k3f9qa" />

		<label for="token">Token</label>
		<input id="token" name="token" type="text" placeholder="XXXX-XXXX-XXXX-XXXX" />

		{#if data.bad}
			<p class="err">
				That code and token do not go together, or the ad has already been deleted. A lost token
				can't be reset, but you can email me from the address on the ad and I'll take it down.
			</p>
		{/if}

		<button class="go" type="submit">Open</button>
	</form>
{/if}
