<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div class="form step veil">
	{#if form?.verified}
		<div class="tokenbox">
			<h2>Confirmed</h2>
			<p style="font-size:13px;margin:0">
				{form.bandName} is live on the board. Check your email for the link to renew, edit or delete it.
				It's only sent once, so keep it.
			</p>
		</div>
	{:else if form?.error}
		<p class="lab">Verify your ad</p>
		<p class="err">{form.error}</p>
	{:else if data.id && data.token}
		<p class="lab">Verify your ad</p>
		<p class="hint">
			One click and it goes live. This also mints your edit token and emails it to you, it is not
			shown here or anywhere else.
		</p>
		<form method="POST" use:enhance>
			<input type="hidden" name="id" value={data.id} />
			<input type="hidden" name="token" value={data.token} />
			<button class="go" type="submit">Confirm and publish</button>
		</form>
	{:else}
		<p class="lab">Verify your ad</p>
		<p class="err">This link is missing its code or token.</p>
	{/if}
</div>
