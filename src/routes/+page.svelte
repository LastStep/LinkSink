<script lang="ts">
	import { store } from '#lib/store/index.ts';
	import LinkList from '#lib/ui/LinkList.svelte';
	import { plural } from '#lib/ui/format.ts';

	const sub = $derived(
		`${plural($store.counts.links, 'link')}${$store.counts.unsorted ? ` · ${$store.counts.unsorted} waiting in Unsorted` : ''}`
	);
</script>

<svelte:head><title>Links · LinkSink</title></svelte:head>

<LinkList
	view={{ kind: 'all' }}
	title="Links"
	{sub}
	empty="No links yet. Paste one anywhere on this page."
/>
