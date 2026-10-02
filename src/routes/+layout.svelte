<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	let { children } = $props();

	// `.veil`'s entrance animation ends holding a resolved-but-not-literal
	// `transform`/`filter` (an identity matrix, blur(0px)) even with
	// fill-forwards; either one creates a stacking context, which then
	// traps a descendant dropdown's z-index inside that step, unable to
	// paint above the *next* step once that step has content under it.
	// Dropping the class once the animation ends removes every animated
	// property outright, so nothing lingers to create one.
	function clearVeil(e: AnimationEvent) {
		(e.target as HTMLElement).classList?.remove('veil');
	}
</script>

<div class="shell" onanimationend={clearVeil}>
	<!-- The board still needs one h1 for search and for screen readers; it
	     just isn't the thing you look at any more. -->
	<h1 class="sr-only">Proba</h1>
	<div class="top">
		<a class="mark" href="/support" aria-label="Proba, about and support">
			<span aria-hidden="true">P</span>
		</a>
		<nav class="switch">
			<a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Find</a>
			<a href="/post" aria-current={page.url.pathname === '/post' ? 'page' : undefined}>Post</a>
			<a href="/renew" aria-current={page.url.pathname === '/renew' ? 'page' : undefined}>Renew</a>
			<a href="/support" aria-current={page.url.pathname === '/support' ? 'page' : undefined}
				>Support</a
			>
			<a href="/terms" aria-current={page.url.pathname === '/terms' ? 'page' : undefined}>Terms</a>
			<a href="/philosophy" aria-current={page.url.pathname === '/philosophy' ? 'page' : undefined}
				>Why</a
			>
		</nav>
	</div>
	{@render children()}
	<!-- Who made this, bottom left, the same weight as the coffee link on
	     the right so the two read as a pair and neither shouts. -->
	<a
		class="by-fab"
		href="https://github.com/marios-pz"
		target="_blank"
		rel="noopener noreferrer"
		aria-label="Built by marios-pz on GitHub"
	>
		<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="currentColor">
			<path
				d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
			/>
		</svg>
		marios-pz
	</a>
	<a
		class="coffee-fab"
		href="https://buymeacoffee.com/mariospz"
		target="_blank"
		rel="noopener noreferrer"
	>
		Buy me a coffee
	</a>
</div>
