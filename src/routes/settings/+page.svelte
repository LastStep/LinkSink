<script lang="ts">
	import { store, StoreError, type SourceJson } from '#lib/store/index.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import ImportExport from './ImportExport.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let error = $state('');
	let saved = $state<string | null>(null);

	async function rename(source: SourceJson, input: HTMLInputElement) {
		const value = input.value.trim();
		if (!value || value === source.name) {
			input.value = source.name;
			return;
		}
		error = '';
		try {
			await store.renameSource(source.id, value);
			saved = source.id;
			setTimeout(() => saved === source.id && (saved = null), 1500);
		} catch (e) {
			error = e instanceof StoreError ? e.message : 'Something went wrong. Try again.';
			input.value = source.name;
		}
	}
</script>

<svelte:head><title>Settings · LinkSink</title></svelte:head>

<main class="page" data-ready={$store.organised}>
	<div class="title-row">
		<h1>Settings</h1>
	</div>

	<section class="card section" aria-labelledby="sources-h">
		<h2 id="sources-h">Sources</h2>
		<p class="muted">
			Where your links come from. Rename one and every later link from its sites uses your name.
		</p>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		{#if $store.sources.length}
			<ul class="list" aria-label="Sources">
				{#each $store.sources as source (source.id)}
					<li class="item">
						<input
							class="field-input"
							value={source.name}
							aria-label="Name of {source.name}"
							maxlength="64"
							onchange={(e) => rename(source, e.currentTarget)}
							onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
						/>
						<span class="hosts muted">{source.hosts.join(', ')}</span>
						<span class="ok muted" aria-live="polite"
							>{#if saved === source.id}<Icon name="check" />Saved{/if}</span
						>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">Sources appear here once a saved link’s details are read.</p>
		{/if}
	</section>

	<ImportExport />

	<section class="card section" aria-labelledby="account-h">
		<h2 id="account-h">Account</h2>
		<p class="muted">Signed in as {data.email}</p>
		<form method="post" action="/logout">
			<button class="btn" type="submit"><Icon name="logout" />Sign out of this device</button>
		</form>
	</section>
</main>

<style>
	.page {
		padding: 0 var(--pad) 64px;
		display: flex;
		flex-direction: column;
		gap: var(--gap);
	}
	.title-row {
		padding-top: 32px;
		padding-bottom: 8px;
	}
	h1 {
		margin: 0;
		font-size: var(--fs-title);
		font-weight: 500;
		letter-spacing: -0.015em;
	}
	.section {
		padding: var(--card-pad);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2 {
		margin: 0;
		font-size: var(--fs-section);
		font-weight: 500;
	}
	.section p {
		margin: 0;
	}
	.error {
		color: var(--negative);
	}
	.list {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
	}
	.item {
		display: grid;
		grid-template-columns: minmax(140px, 240px) minmax(0, 1fr) 72px;
		align-items: center;
		gap: 12px;
		padding: 4px 0;
	}
	.item input {
		height: 32px;
	}
	.hosts {
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ok {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 13px;
	}
	form {
		margin-top: 4px;
	}
	@media (max-width: 759px) {
		.page {
			padding: 0 16px 64px;
		}
		.title-row {
			padding-top: 12px;
		}
		.item {
			grid-template-columns: minmax(0, 1fr) 64px;
		}
		.hosts {
			grid-column: 1;
			grid-row: 2;
			margin-top: -2px;
		}
	}
</style>
