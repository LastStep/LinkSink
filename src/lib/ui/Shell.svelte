<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { store } from '#lib/store/index.ts';
	import Icon from './Icon.svelte';
	import Mark from './Mark.svelte';
	import type { Snippet } from 'svelte';

	// The signed-in screens' frame: the sidebar on a wide screen; a top bar and a menu sheet on a narrow one; on a phone
	// (ADR-0005) a bottom tab bar, with the menu sheet behind More. Only Unsorted keeps a count: it is a queue.
	let { children }: { children: Snippet } = $props();

	let menuOpen = $state(false);
	afterNavigate(() => (menuOpen = false));

	// The command palette, on every signed-in screen: Ctrl/Cmd+K opens and closes it. Its code loads on first use.
	let paletteOpen = $state(false);
	const loadPalette = () => import('./Palette.svelte');
	let paletteFrom: HTMLElement | null = null;
	function onwindowkey(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			if (paletteOpen) closePalette();
			else {
				paletteFrom = document.activeElement as HTMLElement | null;
				menuOpen = false;
				paletteOpen = true;
			}
		}
	}
	function closePalette(restore = true) {
		paletteOpen = false;
		// Focus goes back where it was, unless the command moved it
		if (restore)
			setTimeout(() => {
				if (document.activeElement === document.body) paletteFrom?.focus();
			});
	}

	onMount(() => {
		store.refresh().catch(() => {});
	});

	const path = $derived(page.url.pathname);
	const projectId = $derived(path.startsWith('/projects/') ? path.split('/')[2] : null);
	const tagId = $derived(path.startsWith('/tags/') ? path.split('/')[2] : null);

	const screenName = $derived.by(() => {
		if (path === '/') return 'Links';
		if (path === '/unsorted') return 'Unsorted';
		if (path === '/archive') return 'Archive';
		if (path === '/projects') return 'Projects';
		if (path === '/tags') return 'Tags';
		if (path === '/settings') return 'Settings';
		if (projectId) return $store.projects.find((p) => p.id === projectId)?.name ?? 'Project';
		if (tagId) return $store.tags.find((t) => t.id === tagId)?.name ?? 'Tag';
		return 'LinkSink';
	});
</script>

<svelte:window onkeydown={onwindowkey} />

{#snippet nav()}
	<nav class="nav" aria-label="Lists">
		<a class="nav-item" class:on={path === '/'} href={resolve('/')}>
			<Icon name="link" /><span>Links</span>
		</a>
		<a class="nav-item" class:on={path === '/unsorted'} href={resolve('/unsorted')}>
			<Icon name="inbox" /><span>Unsorted</span>
			{#if $store.counts.unsorted}<span class="n num">{$store.counts.unsorted}</span>{/if}
		</a>
		<a class="nav-item" class:on={path === '/archive'} href={resolve('/archive')}>
			<Icon name="archive" /><span>Archive</span>
		</a>
		<a class="nav-item" class:on={path.startsWith('/tags')} href={resolve('/tags')}>
			<Icon name="tag" /><span>Tags</span>
		</a>
	</nav>
	<p class="group-label">
		<a href={resolve('/projects')} class:on={path === '/projects'}>Projects</a>
	</p>
	<nav class="nav" aria-label="Projects">
		{#each $store.projects as project (project.id)}
			<a
				class="nav-item"
				class:on={projectId === project.id}
				href={resolve('/projects/[id]', { id: project.id })}
			>
				<span class="dot" style:--c="var(--dot-{project.color})"></span><span>{project.name}</span>
			</a>
		{/each}
		<a class="nav-item faint" href="{resolve('/projects')}?new=1">
			<Icon name="plus" /><span>New project</span>
		</a>
	</nav>
	<div class="side-foot">
		<a class="nav-item" class:on={path === '/settings'} href={resolve('/settings')}>
			<Icon name="settings" /><span>Settings</span>
		</a>
		<form method="post" action="/logout">
			<button class="nav-item" type="submit"><Icon name="logout" /><span>Log out</span></button>
		</form>
	</div>
{/snippet}

<div class="app">
	<aside class="side">
		<a class="brand" href={resolve('/')}><Mark /><span>LinkSink</span></a>
		{@render nav()}
	</aside>

	<header class="topbar">
		<button
			class="icon-btn menu-btn"
			type="button"
			aria-label="Menu"
			onclick={() => (menuOpen = true)}
		>
			<Icon name="menu" size={18} />
		</button>
		<p class="top-title"><Mark /><span>{screenName}</span></p>
	</header>

	{#if menuOpen}
		<button class="scrim" type="button" aria-label="Close menu" onclick={() => (menuOpen = false)}
		></button>
		<div class="menu-sheet" role="dialog" aria-modal="true" aria-label="Menu">
			<div class="menu-head">
				<a class="brand" href={resolve('/')}><Mark /><span>LinkSink</span></a>
				<button
					class="icon-btn"
					type="button"
					aria-label="Close"
					onclick={() => (menuOpen = false)}
				>
					<Icon name="x" />
				</button>
			</div>
			{@render nav()}
		</div>
	{/if}

	<div class="main">
		{@render children()}
	</div>

	{#if paletteOpen}
		{#await loadPalette() then { default: Palette }}
			<Palette onclose={() => closePalette()} />
		{/await}
	{/if}

	<nav class="tabs" aria-label="Tabs">
		<a class="tab" aria-current={path === '/' ? 'page' : undefined} href={resolve('/')}>
			<Icon name="link" size={20} /><span>Links</span>
		</a>
		<a
			class="tab"
			aria-current={path === '/unsorted' ? 'page' : undefined}
			href={resolve('/unsorted')}
		>
			<span class="tab-icon">
				<Icon name="inbox" size={20} />
				{#if $store.counts.unsorted}<span class="badge num" data-count
						>{$store.counts.unsorted}</span
					>{/if}
			</span><span>Unsorted</span>
		</a>
		<a
			class="tab"
			aria-current={path.startsWith('/projects') ? 'page' : undefined}
			href={resolve('/projects')}
		>
			<Icon name="folder" size={20} /><span>Projects</span>
		</a>
		<a
			class="tab"
			aria-current={path.startsWith('/tags') ? 'page' : undefined}
			href={resolve('/tags')}
		>
			<Icon name="tag" size={20} /><span>Tags</span>
		</a>
		<button
			class="tab"
			type="button"
			aria-haspopup="dialog"
			aria-expanded={menuOpen}
			onclick={() => (menuOpen = true)}
		>
			<Icon name="menu" size={20} /><span>More</span>
		</button>
	</nav>
</div>

<style>
	.app {
		display: grid;
		grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
		min-height: 100dvh;
	}
	.side {
		position: sticky;
		top: 0;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		padding: 20px 12px 16px;
		overflow: auto;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 8px;
		font-weight: 600;
		font-size: 15px;
		letter-spacing: -0.01em;
		color: var(--text);
		text-decoration: none;
	}
	.nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 18px;
	}
	/* The project list scrolls inside its own area (BUG-003); everything above and below it stays where it is. The small
	   padding and matching negative margin keep a focused row's ring from being cut at the scroll area's edge. */
	.nav[aria-label='Projects'] {
		margin: -3px;
		padding: 3px;
		flex: 0 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	/* A long list scrolls; its rows keep their height instead of squeezing to fit. */
	.nav > .nav-item {
		flex: none;
	}
	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		height: var(--nav-row);
		padding: 0 10px;
		border-radius: var(--radius-control);
		color: var(--muted);
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color var(--t-hover) var(--ease-out),
			color var(--t-hover) var(--ease-out);
	}
	.nav-item:hover {
		background: var(--raised);
		color: var(--text);
	}
	.nav-item.on {
		background: var(--active);
		color: var(--text);
	}
	.nav-item > span:nth-child(2) {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: left;
	}
	.nav-item .n {
		font-size: var(--fs-small);
		color: var(--muted);
	}
	.nav-item.faint {
		color: var(--faint);
	}
	.group-label {
		margin: 28px 10px 8px;
		font-size: var(--fs-small);
	}
	.group-label a {
		color: var(--muted);
		text-decoration: none;
	}
	.group-label a:hover,
	.group-label a.on {
		color: var(--text);
	}
	.group-label,
	.side-foot {
		flex: none;
	}
	.side-foot {
		margin-top: auto;
		padding-top: 20px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.topbar {
		display: none;
	}
	.main {
		min-width: 0;
	}
	.menu-sheet {
		position: fixed;
		inset: 0 auto 0 0;
		z-index: 31;
		width: min(320px, 86vw);
		display: flex;
		flex-direction: column;
		padding: 12px 12px 16px;
		background: var(--ground);
		overflow: auto;
	}
	.menu-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.top-title {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-weight: 600;
		font-size: 16px;
		min-width: 0;
	}
	.top-title span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 1099px) {
		.app {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: 48px minmax(0, 1fr);
		}
		.side {
			display: none;
		}
		.topbar {
			position: sticky;
			top: 0;
			z-index: 20;
			display: flex;
			align-items: center;
			gap: 8px;
			height: 48px;
			padding: 0 8px;
			background: var(--ground);
		}
	}
	.tabs {
		display: none;
	}
	/* The phone: the top bar names the screen, the tab bar does the moving about. */
	@media (max-width: 759px) {
		.menu-btn {
			display: none;
		}
		.topbar {
			padding: 0 16px;
		}
		.main {
			padding-bottom: calc(60px + env(safe-area-inset-bottom));
		}
		.tabs {
			position: fixed;
			z-index: 25;
			left: 0;
			right: 0;
			bottom: 0;
			display: grid;
			grid-template-columns: repeat(5, 1fr);
			padding: 4px 4px env(safe-area-inset-bottom);
			background: var(--surface);
			border-top: 1px solid var(--border);
		}
		.tab {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 3px;
			height: 52px;
			border-radius: var(--radius-control);
			color: var(--muted);
			font-size: 11px;
			line-height: 14px;
			text-decoration: none;
			cursor: pointer;
		}
		.tab[aria-current='page'] {
			color: var(--text);
			font-weight: 500;
		}
		.tab-icon {
			position: relative;
			display: inline-flex;
		}
		.badge {
			position: absolute;
			top: -5px;
			right: -9px;
			min-width: 16px;
			height: 16px;
			padding: 0 4px;
			border-radius: 8px;
			background: var(--text);
			color: var(--surface);
			font-size: 10px;
			font-weight: 600;
			line-height: 16px;
			text-align: center;
		}
	}
	@media (prefers-reduced-motion: no-preference) {
		.menu-sheet {
			animation: ls-panel-in var(--t-panel) var(--ease-out) both;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.menu-sheet {
			animation: ls-fade var(--t-fade-reduced) both;
		}
	}
</style>
