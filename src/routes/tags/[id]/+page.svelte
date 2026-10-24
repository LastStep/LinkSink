<script lang="ts">
	import { page } from '$app/state';
	import { store } from '#lib/store/index.ts';
	import LinkList from '#lib/ui/LinkList.svelte';
	import { plural } from '#lib/ui/format.ts';

	const id = $derived(page.params.id ?? '');
	const tag = $derived($store.tags.find((t) => t.id === id));
</script>

<svelte:head><title>{tag?.name ?? 'Tag'} · LinkSink</title></svelte:head>

<LinkList
	view={{ kind: 'tag', id }}
	title={tag?.name ?? 'Tag'}
	sub={tag ? plural(tag.count, 'link') : ''}
	empty="No links carry this tag."
/>
