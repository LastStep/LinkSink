<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import Shell from '#lib/ui/Shell.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	/** Screens outside the signed-in frame. */
	const bare = $derived(['/login', '/signup', '/logout'].includes(page.url.pathname));
</script>

<svelte:head>
	<!-- LinkSink's mark (T-0028): the SVG adapts to a dark browser theme; the PNGs are for browsers that draw no SVG icon
	     and for a phone's home screen. Every page, the sign-in and sign-up ones included, has them from this layout. -->
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
	<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
	<title>LinkSink</title>
</svelte:head>

{#if bare}
	{@render children()}
{:else}
	<Shell>{@render children()}</Shell>
{/if}
