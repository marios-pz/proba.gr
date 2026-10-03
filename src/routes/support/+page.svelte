<script lang="ts">
	let { data } = $props();
	const n = (x: number) => x.toLocaleString('en');
</script>

<div class="form step veil">
	<p class="lab">Support</p>
	<p class="hint">Free to use, but it does cost a bit to run</p>

	<div class="stats">
		<div><b>{n(data.stats.visits)}</b><span>Visits</span></div>
		<div><b>{n(data.stats.live)}</b><span>Ads live now</span></div>
		<div><b>{n(data.stats.posted)}</b><span>Ads posted</span></div>
	</div>

	<div class="prose">
		<p>
			Proba is free. No ads, no accounts, no fees. I made it because a band looking for a drummer
			shouldn't depend on an Instagram story that's gone in 24 hours. Here the ad stays up and
			people nearby can actually find it.
		</p>
		<p>
			Running it still costs money: the database, the domain, and the emails that confirm ads and
			remind you before they expire.
		</p>
		<p>
			If you chip in, it pays for that first. Whatever's left I spend on local bands, going to their
			gigs and buying their merch. Which is pretty much what this site is for anyway.
		</p>
	</div>

	<div class="row" style="gap:10px">
		<a
			class="social"
			href="https://buymeacoffee.com/mariospz"
			target="_blank"
			rel="noopener noreferrer"
		>
			Buy me a coffee
		</a>
		<a
			class="social"
			href="https://www.instagram.com/speedy.drums/"
			target="_blank"
			rel="noopener noreferrer"
		>
			@speedy.drums
		</a>
	</div>
</div>
