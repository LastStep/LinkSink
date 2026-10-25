<script lang="ts">
	import { store } from '#lib/store/index.ts';
	import LinkList from '#lib/ui/LinkList.svelte';
	import { plural } from '#lib/ui/format.ts';

	const sub = $derived(
		$store.counts.unsorted
			? `${plural($store.counts.unsorted, 'link')} with no tag and no project yet`
			: 'Links with no tag and no project wait here'
	);
</script>

<svelte:head><title>Unsorted · LinkSink</title></svelte:head>

<LinkList
	view={{ kind: 'unsorted' }}
	title="Unsorted"
	{sub}
	empty="Nothing waiting. Every link has a tag or a project, so there is nothing to sort."
/>
