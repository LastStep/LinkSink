<script lang="ts">
	import { resolve } from '$app/paths';
	import AuthCard from '#lib/AuthCard.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<AuthCard title="Create your account">
	{#if form?.sent}
		<p class="note" role="status">
			We sent a link to <strong>{form.email}</strong>. Open it to confirm your email, then log in.
		</p>
	{:else}
		{#if data.closed}
			<p class="note">
				This LinkSink already has its account. <a href={resolve('/login')}>Log in</a>
			</p>
		{/if}
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
				Password
				<input
					name="password"
					type="password"
					autocomplete="new-password"
					minlength="10"
					required
				/>
			</label>
			<button type="submit">Sign up</button>
		</form>
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<p class="note">Already have the account? <a href={resolve('/login')}>Log in</a></p>
	{/if}
</AuthCard>
