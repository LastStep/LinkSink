<script lang="ts">
	import { page } from '$app/state';
	import { store } from '#lib/store/index.ts';
	import LinkList from '#lib/ui/LinkList.svelte';
	import { plural } from '#lib/ui/format.ts';

	const id = $derived(page.params.id ?? '');
	const project = $derived($store.projects.find((p) => p.id === id));
	const sub = $derived(project ? (project.description ?? plural(project.count, 'link')) : '');
</script>

<svelte:head><title>{project?.name ?? 'Project'} · LinkSink</title></svelte:head>

<LinkList
	view={{ kind: 'project', id }}
	title={project?.name ?? 'Project'}
	{sub}
	empty="No links in this project yet. Add some from a link’s organiser."
/>
