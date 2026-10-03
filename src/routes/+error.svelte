<script lang="ts">
	import { page } from '$app/state';
	const err = $derived(page.error);
</script>

<div class="down-backdrop">
	<div class="down-modal torn" class:alarm={err?.dbDown}>
		{#if err?.dbDown}
			<p class="down-big">Database down</p>
			<p class="down-mid">We are in the process of fixing it.</p>
			<p class="down-small">please contact admin on marios-pz@proton.me</p>
		{:else}
			<p class="down-big">{page.status}</p>
			<p class="down-mid">{err?.message ?? 'Something went wrong.'}</p>
			<a class="social" href="/">&larr; Back to the board</a>
		{/if}
	</div>
</div>

<style>
	/* A true popup: fixed over the whole viewport, nav and brand included,
	   rather than just swapping out the page content in place. A dead
	   database means there is nothing behind it worth seeing anyway. */
	.down-backdrop {
		position: fixed;
		inset: 0;
		z-index: 500;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
		background: rgba(3, 5, 3, 0.9);
		backdrop-filter: blur(2px);
	}
	.down-modal {
		max-width: 420px;
		width: 100%;
		background: var(--raise);
		border: 0;
		padding: 30px 26px;
		text-align: center;
		box-shadow:
			inset 0 1px 0 var(--moss),
			0 0 70px rgba(0, 0, 0, 0.85);
	}
	.down-modal.alarm {
		box-shadow:
			inset 0 1px 0 var(--stamp),
			0 0 70px rgba(0, 0, 0, 0.85);
	}
	.down-big {
		font-family: var(--disp);
		text-transform: uppercase;
		font-weight: 600;
		font-size: clamp(26px, 6vw, 38px);
		line-height: 1.05;
		letter-spacing: 0.08em;
		margin: 0 0 10px;
		color: var(--stamp);
		text-shadow: 0 0 26px rgba(157, 32, 41, 0.45);
	}
	.down-mid {
		font-size: 14px;
		color: var(--ink);
		margin: 0 0 16px;
	}
	.down-small {
		font-size: 10.5px;
		letter-spacing: 0.05em;
		color: var(--dim);
		margin: 0;
		text-transform: none;
	}
</style>
