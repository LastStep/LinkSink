<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { store } from '#lib/store/index.ts';
	import Icon from './Icon.svelte';
	import Mark from './Mark.svelte';
	import type { Snippet } from 'svelte';

	// The signed-in screens' frame: the sidebar on a wide screen, a top bar and a menu sheet on a phone.
	let { children }: { children: Snippet } = $props();

	let menuOpen = $state(false);
	afterNavigate(() => (menuOpen = false));

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
			{#if $store.tags.length}<span class="n num">{$store.tags.length}</span>{/if}
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
				{#if project.count}<span class="n num">{project.count}</span>{/if}
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
		<button class="icon-btn" type="button" aria-label="Menu" onclick={() => (menuOpen = true)}>
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
	.nav[aria-label='Projects'] {
		margin-top: 0;
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
