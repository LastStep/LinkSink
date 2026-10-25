<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { store, StoreError } from '#lib/store/index.ts';
	import LinkList from '#lib/ui/LinkList.svelte';
	import { plural } from '#lib/ui/format.ts';

	const id = $derived(page.params.id ?? '');
	const project = $derived($store.projects.find((p) => p.id === id));
	const sub = $derived(project ? (project.description ?? plural(project.count, 'link')) : '');

	// The name changes in place (T-0027), as it does on the Projects page: Enter saves, Escape cancels, a name that is
	// empty or another project's is refused with a message and the field stays open.
	let editing = $state(false);
	let draft = $state('');
	let error = $state('');
	let saving = false;
	let field = $state<HTMLInputElement | null>(null);
	let renameBtn = $state<HTMLButtonElement | null>(null);

	// Another project's page, or a project that is gone: no half-open edit carries over.
	$effect(() => {
		void id;
		editing = false;
		error = '';
	});

	async function start() {
		if (!project) return;
		draft = project.name;
		error = '';
		editing = true;
		await tick();
		field?.select();
	}

	async function leave() {
		editing = false;
		error = '';
		await tick();
		renameBtn?.focus();
	}

	async function save() {
		if (!editing || saving || !project) return;
		const name = draft.trim();
		if (!name) {
			error = 'A project needs a name.';
			field?.focus();
			return;
		}
		if (name === project.name) return leave();
		saving = true;
		try {
			await store.updateProject(project.id, { name });
			await leave();
		} catch (e) {
			error = e instanceof StoreError ? e.message : 'Something went wrong. Try again.';
			field?.focus();
		} finally {
			saving = false;
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void save();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			void leave();
		}
	}
</script>

<svelte:head><title>{project?.name ?? 'Project'} · LinkSink</title></svelte:head>

{#snippet heading()}
	<div class="name-row">
		{#if editing}
			<input
				bind:this={field}
				bind:value={draft}
				class="field-input name-in"
				aria-label="Project name"
				aria-invalid={error ? 'true' : undefined}
				oninput={() => (error = '')}
				maxlength="64"
				{onkeydown}
				onblur={() => {
					// Leaving the field saves, as on the Projects page; a refusal keeps it open with its message
					if (!error) void save();
				}}
			/>
		{:else}
			<h1>{project?.name ?? 'Project'}</h1>
			{#if project}
				<button bind:this={renameBtn} class="btn ghost rename" type="button" onclick={start}
					>Rename</button
				>
			{/if}
		{/if}
	</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
{/snippet}

<LinkList
	view={{ kind: 'project', id }}
	title={project?.name ?? 'Project'}
	{sub}
	{heading}
	empty="No links in this project yet. Paste a link on this page and it joins the project."
/>

<style>
	.name-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.rename {
		/* The button sits in the heading's line without making the line taller */
		margin: -6px 0;
	}
	h1 {
		margin: 0;
		min-width: 0;
		font-size: var(--fs-title);
		line-height: 1.15;
		font-weight: 500;
		letter-spacing: -0.015em;
		overflow-wrap: anywhere;
	}
	.name-in {
		font-size: var(--fs-title);
		font-weight: 500;
		letter-spacing: -0.015em;
		height: 40px;
		max-width: 520px;
	}
	.error {
		margin: 4px 0 0;
		color: var(--negative);
	}
	/* On a phone the top bar names the screen; the heading stays for screen readers, Rename stays in reach. */
	@media (max-width: 759px) {
		h1 {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}
</style>
