<script lang="ts">
	import { resolve } from '$app/paths';
	import AuthCard from '#lib/AuthCard.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<AuthCard title="Log in">
	{#if data.verified}<p class="note" role="status">
			Your email is confirmed. Log in to start.
		</p>{/if}
	<form method="post">
		<label
			>Email <input
				name="email"
				type="email"
				autocomplete="email"
				required
				value={form?.email ?? ''}
			/></label
		>
		<label>
			Password <input name="password" type="password" autocomplete="current-password" required />
		</label>
		<button type="submit">Log in</button>
	</form>
	{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
	<p class="note">No account yet? <a href={resolve('/signup')}>Sign up</a></p>
</AuthCard>
