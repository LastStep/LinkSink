<script lang="ts">
	// The command palette (Ctrl/Cmd+K, F-web-mvp "Finding"): add a link, search, jump to a project, tag or source, or go
	// to Unsorted, Archive or Settings. Typing narrows the list; arrows and Enter pick; Esc closes. Loaded on first use.
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { fold } from '#lib/search/query.ts';
	import { store } from '#lib/store/index.ts';
	import { parseHttpUrl } from '#lib/url.ts';
	import Icon, { type IconName } from './Icon.svelte';

	let { onclose }: { onclose: () => void } = $props();

	type Item = {
		id: string;
		group: string;
		label: string;
		icon?: IconName;
		color?: string;
		hint?: string;
		run: () => unknown;
	};

	let text = $state('');
	let active = $state(0);
	let input = $state<HTMLInputElement | null>(null);
	let list = $state<HTMLElement | null>(null);

	onMount(() => {
		input?.focus();
	});

	/** The pages a link can be pasted on (Archive takes none). */
	const PASTE_PAGES = /^\/(unsorted|projects\/[^/]+|tags\/[^/]+)?$/;

	async function onListPage() {
		if (!PASTE_PAGES.test(page.url.pathname)) await goto(resolve('/'));
		await tick();
	}
	const signal = (name: string, detail: object = {}) =>
		window.dispatchEvent(new CustomEvent(name, { detail }));

	// every path handed to go() is made by resolve() (some with a query added)
	// eslint-disable-next-line svelte/no-navigation-without-resolve
	const go = (path: string) => () => goto(path);

	const items = $derived.by((): Item[] => {
		const typed = text.trim();
		const url = parseHttpUrl(typed) ? typed : null;
		const actions: Item[] = [];
		if (url) {
			actions.push({
				id: 'save',
				group: 'Add',
				label: `Save ${url}`,
				icon: 'plus',
				run: async () => {
					await onListPage();
					signal('linksink:add', { url });
				}
			});
		} else {
			actions.push({
				id: 'add',
				group: 'Add',
				label: 'Add a link',
				icon: 'plus',
				hint: 'n',
				run: async () => {
					await onListPage();
					signal('linksink:add');
				}
			});
			actions.push({
				id: 'search',
				group: 'Search',
				label: typed ? `Search links for “${typed}”` : 'Search links',
				icon: 'search',
				hint: '/',
				run: typed
					? go(`${resolve('/')}?q=${encodeURIComponent(typed)}`)
					: async () => {
							if (!/^\/(archive|unsorted|projects\/[^/]+|tags\/[^/]+)?$/.test(page.url.pathname))
								await goto(resolve('/'));
							await tick();
							document.querySelector<HTMLInputElement>('input[type=search]')?.focus();
						}
			});
		}
		const places: Item[] = [
			{ id: 'go-links', group: 'Go to', label: 'Links', icon: 'link', run: go(resolve('/')) },
			{
				id: 'go-unsorted',
				group: 'Go to',
				label: 'Unsorted',
				icon: 'inbox',
				run: go(resolve('/unsorted'))
			},
			{
				id: 'go-archive',
				group: 'Go to',
				label: 'Archive',
				icon: 'archive',
				run: go(resolve('/archive'))
			},
			{
				id: 'go-projects',
				group: 'Go to',
				label: 'Projects',
				icon: 'folder',
				run: go(resolve('/projects'))
			},
			{ id: 'go-tags', group: 'Go to', label: 'Tags', icon: 'tag', run: go(resolve('/tags')) },
			{
				id: 'go-settings',
				group: 'Go to',
				label: 'Settings',
				icon: 'settings',
				run: go(resolve('/settings'))
			}
		];
		const things: Item[] = [
			...$store.projects.map((p) => ({
				id: `project-${p.id}`,
				group: 'Projects',
				label: p.name,
				color: p.color,
				run: go(resolve('/projects/[id]', { id: p.id }))
			})),
			...$store.tags.map((t) => ({
				id: `tag-${t.id}`,
				group: 'Tags',
				label: t.name,
				icon: 'tag' as const,
				run: go(resolve('/tags/[id]', { id: t.id }))
			})),
			...$store.sources.map((s) => ({
				id: `source-${s.id}`,
				group: 'Sources',
				label: s.name,
				icon: 'open' as const,
				run: go(`${resolve('/')}?source=${encodeURIComponent(s.id)}`)
			}))
		];
		if (!typed) return [...actions, ...places, ...things.slice(0, 8)];
		if (url) return actions;
		// Every typed word in the name, accents and case aside
		const want = typed.split(/\s+/).map(fold);
		const hit = (item: Item) => {
			const name = fold(item.label);
			return want.every((w) => name.includes(w));
		};
		return [...actions, ...[...places, ...things].filter(hit).slice(0, 40)];
	});

	$effect(() => {
		void items.length;
		active = 0;
	});

	async function pick(item: Item | undefined) {
		if (!item) return;
		onclose();
		await item.run();
	}

	function onkey(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const n = items.length;
			active = (active + (event.key === 'ArrowDown' ? 1 : n - 1)) % n;
			tick().then(() =>
				list?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
			);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			pick(items[active]);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onclose();
		} else if (event.key === 'Tab') {
			event.preventDefault();
		}
	}
</script>

<button class="scrim palette-scrim" type="button" aria-label="Close the palette" onclick={onclose}
></button>
<div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
	<label class="find">
		<Icon name="search" />
		<input
			bind:this={input}
			bind:value={text}
			type="text"
			placeholder="Type a command, a name, or paste a link"
			aria-label="Command"
			role="combobox"
			aria-expanded="true"
			aria-controls="palette-list"
			aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
			autocomplete="off"
			spellcheck="false"
			onkeydown={onkey}
		/>
		<kbd class="esc">Esc</kbd>
	</label>
	<ul class="items" id="palette-list" role="listbox" aria-label="Commands" bind:this={list}>
		{#each items as item, i (item.id)}
			{#if i === 0 || items[i - 1].group !== item.group}
				<li class="group" role="presentation">{item.group}</li>
			{/if}
			<li
				id="palette-{item.id}"
				class="item"
				class:active={i === active}
				role="option"
				aria-selected={i === active}
				data-i={i}
				onpointermove={() => (active = i)}
				onclick={() => pick(item)}
				onkeydown={() => {}}
			>
				{#if item.color}<span class="dot" style:--c="var(--dot-{item.color})"
					></span>{:else if item.icon}<Icon name={item.icon} />{/if}
				<span class="label">{item.label}</span>
				{#if item.hint}<kbd class="hint">{item.hint}</kbd>{/if}
			</li>
		{:else}
			<li class="nothing muted" role="presentation">Nothing by that name</li>
		{/each}
	</ul>
</div>

<style>
	.palette-scrim {
		z-index: 50;
		background: rgb(0 0 0 / 0.24);
	}
	.palette {
		position: fixed;
		z-index: 51;
		top: 12vh;
		left: 50%;
		translate: -50% 0;
		width: min(600px, calc(100vw - 32px));
		max-height: min(480px, 76dvh);
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		box-shadow: 0 16px 48px rgb(0 0 0 / 0.2);
		overflow: hidden;
	}
	.find {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 52px;
		padding: 0 14px 0 16px;
		border-bottom: 1px solid var(--rule);
		color: var(--muted);
	}
	.find input {
		flex: 1;
		min-width: 0;
		height: 100%;
		border: 0;
		outline: none;
		background: none;
		color: var(--text);
		font-size: 15px;
	}
	.find input::placeholder {
		color: var(--faint);
	}
	kbd {
		display: inline-flex;
		align-items: center;
		height: 20px;
		padding: 0 6px;
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--muted);
		font: inherit;
		font-size: 11px;
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 6px;
		overflow: auto;
	}
	.group {
		padding: 10px 10px 4px;
		font-size: 12px;
		font-weight: 500;
		color: var(--muted);
	}
	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 36px;
		padding: 0 10px;
		border-radius: var(--radius-control);
		color: var(--text);
		cursor: pointer;
	}
	.item :global(.icon-svg) {
		color: var(--muted);
	}
	.item.active {
		background: var(--active);
	}
	.label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dot {
		margin: 0 4px;
	}
	.nothing {
		padding: 16px 10px;
	}
	@media (prefers-reduced-motion: no-preference) {
		.palette {
			animation: ls-panel-in var(--t-ui) var(--ease-out) both;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.palette {
			animation: ls-fade var(--t-fade-reduced) both;
		}
	}
</style>
