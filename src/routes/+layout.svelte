<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import Shell from '#lib/ui/Shell.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	/** Screens outside the signed-in frame. */
	const bare = $derived(['/login', '/signup', '/logout'].includes(page.url.pathname));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>LinkSink</title>
</svelte:head>

{#if bare}
	{@render children()}
{:else}
	<Shell>{@render children()}</Shell>
{/if}
