<script lang="ts">
	import { onMount } from 'svelte';
	import { listenForPastes } from '#lib/paste.ts';
	import { store, StoreError, type StoreLink } from '#lib/store/index.ts';
	import { displayHost } from '#lib/url.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** How long a deleted link can be brought back from the toast. */
	const UNDO_MS = 5000;

	const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

	let url = $state('');
	let title = $state('');
	let message = $state('');
	let notice = $state('');
	let flashed = $state<string | null>(null);
	let undo = $state<{ id: string; title: string } | null>(null);
	let undoTimer: ReturnType<typeof setTimeout> | undefined;
	let box = $state<HTMLInputElement | null>(null);

	$effect(() => {
		const q = data.q;
		store.list(q).catch(showError);
	});

	let listening = $state(false);
	onMount(() => {
		const stop = listenForPastes(
			(pasted) => {
				// Pasted into the box: the title typed beside it goes with it.
				const typed = document.activeElement === box ? title : '';
				if (typed) title = '';
				save(pasted, typed);
			},
			() => box
		);
		listening = true;
		return stop;
	});

	function showError(error: unknown) {
		message = error instanceof StoreError ? error.message : 'Something went wrong. Try again.';
	}

	async function save(link: string, typedTitle = '') {
		message = '';
		notice = '';
		try {
			const result = await store.put({ url: link, title: typedTitle || null, via: 'paste' });
			if (result.duplicate) {
				notice = 'Already saved.';
				flashed = result.link.id;
				setTimeout(() => {
					if (flashed === result.link.id) flashed = null;
				}, 2000);
				document.getElementById(`link-${result.link.id}`)?.scrollIntoView({ block: 'nearest' });
			}
		} catch (error) {
			showError(error);
		}
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const link = url;
		const typed = title;
		url = '';
		title = '';
		save(link, typed);
	}

	async function remove(link: StoreLink) {
		message = '';
		clearTimeout(undoTimer);
		try {
			await store.remove(link.id);
			undo = { id: link.id, title: link.title || displayHost(link.url) };
			undoTimer = setTimeout(() => (undo = null), UNDO_MS);
		} catch (error) {
			showError(error);
		}
	}

	async function restore() {
		if (!undo) return;
		const { id } = undo;
		clearTimeout(undoTimer);
		undo = null;
		try {
			await store.restore(id);
		} catch (error) {
			showError(error);
		}
	}
</script>

<main class="page" data-ready={listening && !$store.loading}>
	<header class="top">
		<p class="brand">LinkSink</p>
		<form method="post" action="?/signOut">
			<button class="ghost" type="submit">Log out</button>
		</form>
	</header>

	<h1>Links</h1>

	<form class="add" onsubmit={submit}>
		<input
			bind:this={box}
			bind:value={url}
			name="url"
			type="url"
			placeholder="Paste a link"
			aria-label="Link"
			required
		/>
		<input bind:value={title} name="title" placeholder="Title (optional)" aria-label="Title" />
		<button type="submit">Save</button>
	</form>
	{#if message}<p class="error" role="alert">{message}</p>{/if}
	{#if notice}<p class="notice" role="status">{notice}</p>{/if}

	<form class="search" method="get" role="search">
		<input name="q" type="search" placeholder="Search" aria-label="Search" value={data.q} />
	</form>

	{#if $store.links.length > 0}
		<ul class="list" aria-label="Links">
			{#each $store.links as link (link.id)}
				<li
					class="row"
					id="link-{link.id}"
					class:pending={link.pending}
					class:flash={flashed === link.id}
					data-state={link.pending ? 'saving' : 'saved'}
				>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a saved link points off-site -->
					<a class="t" href={link.url} rel="noopener noreferrer" target="_blank"
						>{link.title || link.url}</a
					>
					<span class="meta">{link.pending ? 'Saving…' : displayHost(link.url)}</span>
					<time class="meta num" datetime={new Date(link.createdAt).toISOString()}>
						{time.format(link.createdAt)}
					</time>
					<button
						class="ghost del"
						type="button"
						aria-label="Delete {link.title || link.url}"
						disabled={link.pending}
						onclick={() => remove(link)}>Delete</button
					>
				</li>
			{/each}
		</ul>
	{:else if !$store.loading}
		<p class="empty">
			{data.q ? `Nothing matches “${data.q}”.` : 'No links yet. Paste one anywhere on this page.'}
		</p>
	{/if}

	{#if undo}
		<div class="toast" role="status">
			<span>Deleted “{undo.title}”.</span>
			<button class="ghost undo" type="button" onclick={restore}>Undo</button>
		</div>
	{/if}
</main>

<style>
	.page {
		max-width: 880px;
		margin: 0 auto;
		padding: 16px 16px 48px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.brand {
		margin: 0;
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	h1 {
		margin: 12px 0 0;
		font-size: var(--fs-title);
		font-weight: 500;
		letter-spacing: -0.015em;
	}
	input {
		height: var(--control-height);
		padding: 0 10px;
		border: 1px solid var(--control);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		min-width: 0;
	}
	button {
		height: var(--control-height);
		padding: 0 12px;
		border: 0;
		border-radius: var(--radius-control);
		background: var(--primary);
		color: var(--primary-ink);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	button.ghost {
		background: transparent;
		color: var(--muted);
	}
	.add {
		display: grid;
		grid-template-columns: 2fr 1fr auto;
		gap: 8px;
	}
	.add input[name='url'] {
		height: 44px;
	}
	.add button {
		height: 44px;
	}
	.search input {
		width: 100%;
		max-width: 260px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 4px;
		background: var(--surface);
		border-radius: var(--radius-card);
	}
	.row {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto auto;
		align-items: center;
		gap: 14px;
		min-height: var(--row-height);
		padding: 0 10px;
	}
	.row + .row::before {
		content: '';
		position: absolute;
		left: 6px;
		right: 6px;
		top: 0;
		height: 1px;
		background: var(--rule);
	}
	.t {
		color: var(--text);
		text-decoration: none;
		font-weight: 450;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		color: var(--muted);
		font-size: 13px;
		white-space: nowrap;
	}
	.empty {
		margin: 0;
		padding: 40px 24px;
		background: var(--surface);
		border-radius: var(--radius-card);
		color: var(--muted);
	}
	.error {
		margin: 0;
		color: var(--negative);
	}
	.notice {
		margin: 0;
		color: var(--muted);
	}
	.row.pending .t {
		color: var(--muted);
	}
	.row.flash {
		background: var(--mark);
		border-radius: var(--radius-control);
		transition: background var(--t-ui) var(--ease-out);
	}
	button.del {
		height: 28px;
		padding: 0 8px;
		font-size: var(--fs-small);
	}
	button.del:disabled {
		visibility: hidden;
	}
	.toast {
		position: fixed;
		left: 50%;
		bottom: 24px;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 8px 8px 14px;
		background: var(--raised);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		max-width: calc(100vw - 32px);
	}
	.toast span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	button.undo {
		color: var(--accent);
	}
	@media (max-width: 600px) {
		.add {
			grid-template-columns: 1fr;
		}
		.row {
			grid-template-columns: minmax(0, 1fr) auto auto;
		}
		.row time {
			display: none;
		}
	}
</style>
