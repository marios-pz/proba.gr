<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<form class="form step veil" method="POST" action="?/nudge" use:enhance>
	<p class="lab">Renew an ad</p>
	{#if form?.renewed}
		<div class="tokenbox step veil" style="margin-top:12px">
			<h2>Up until {form.until}</h2>
			<p style="font-size:13px;margin:0">
				Everything else, editing or taking it down, is on the page the link in your first email
				opens.
			</p>
		</div>
	{:else}
		<p class="hint">One click and it's up for another 14 days.</p>
		<input type="hidden" name="id" value={data.nudgeId} />
		<input type="hidden" name="nudge" value={data.nudge} />
		<button class="go" type="submit">Renew now</button>
		{#if form?.error}<p class="err">{form.error}</p>{/if}
	{/if}
</form>
