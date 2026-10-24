<script lang="ts">
	import { store } from '#lib/store/index.ts';
	import LinkList from '#lib/ui/LinkList.svelte';
	import { plural } from '#lib/ui/format.ts';

	const sub = $derived(
		`${plural($store.counts.archive, 'archived link')}, kept with everything on them`
	);
</script>

<svelte:head><title>Archive · LinkSink</title></svelte:head>

<LinkList
	view={{ kind: 'archive' }}
	title="Archive"
	{sub}
	empty="Nothing archived. Archive a link when you are done with it; it keeps everything."
/>
