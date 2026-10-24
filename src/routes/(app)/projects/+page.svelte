<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { COLORS } from '#lib/fields.ts';
	import { store, StoreError, type ProjectJson } from '#lib/store/index.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import Swatches from '#lib/ui/Swatches.svelte';
	import { plural } from '#lib/ui/format.ts';

	let name = $state('');
	let color = $state<string>(COLORS[0]);
	let description = $state('');
	let error = $state('');
	let confirming = $state<string | null>(null);
	let nameBox = $state<HTMLInputElement | null>(null);

	const projects = $derived($store.projects);

	onMount(() => {
		if (page.url.searchParams.has('new')) nameBox?.focus();
	});
	$effect(() => {
		// The next unused colour for the next project.
		const used = new Set(projects.map((p) => p.color));
		color = COLORS.find((c) => !used.has(c)) ?? COLORS[projects.length % COLORS.length];
	});

	async function run(fn: () => Promise<unknown>) {
		error = '';
		try {
			await fn();
			return true;
		} catch (e) {
			error = e instanceof StoreError ? e.message : 'Something went wrong. Try again.';
			return false;
		}
	}

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (!name.trim()) return;
		const ok = await run(() =>
			store.createProject({ name, color, description: description.trim() || null })
		);
		if (ok) {
			name = '';
			description = '';
		}
	}

	function rename(project: ProjectJson, value: string) {
		if (value.trim() && value.trim() !== project.name) {
			run(() => store.updateProject(project.id, { name: value }));
		}
	}

	async function move(project: ProjectJson, by: -1 | 1) {
		const ids = projects.map((p) => p.id);
		const i = ids.indexOf(project.id);
		const j = i + by;
		if (j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		await run(() => store.reorderProjects(ids));
		await tick();
		document.getElementById(`move-${by < 0 ? 'up' : 'down'}-${project.id}`)?.focus();
	}

	async function remove(project: ProjectJson) {
		if (await run(() => store.deleteProject(project.id))) confirming = null;
	}
</script>

<svelte:head><title>Projects · LinkSink</title></svelte:head>

<main class="page" data-ready={$store.organised}>
	<div class="title-row">
		<div>
			<h1>Projects</h1>
			<p class="muted sub">Collections you make and name. A link can be in several.</p>
		</div>
	</div>

	<form class="card new" onsubmit={create} aria-label="New project">
		<label class="grow">
			<span>New project</span>
			<input
				bind:this={nameBox}
				bind:value={name}
				class="field-input"
				name="name"
				placeholder="Name"
				aria-label="Project name"
				maxlength="64"
				required
			/>
		</label>
		<label class="grow">
			<span>Description <em class="muted">optional</em></span>
			<input
				bind:value={description}
				class="field-input"
				name="description"
				placeholder="What it is for"
				aria-label="Project description"
			/>
		</label>
		<div class="colour">
			<span>Colour</span>
			<Swatches value={color} label="New project colour" onpick={(c) => (color = c ?? COLORS[0])} />
		</div>
		<button class="btn primary" type="submit"><Icon name="plus" />Create</button>
	</form>
	{#if error}<p class="error" role="alert">{error}</p>{/if}

	{#if projects.length}
		<ul class="card list" aria-label="Projects">
			{#each projects as project, i (project.id)}
				<li class="item">
					<span class="dot big" style:--c="var(--dot-{project.color})"></span>
					<div class="fields">
						<input
							class="name"
							value={project.name}
							aria-label="Name of {project.name}"
							maxlength="64"
							onchange={(e) => rename(project, e.currentTarget.value)}
							onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
						/>
						<input
							class="desc muted"
							value={project.description ?? ''}
							placeholder="Add a description"
							aria-label="Description of {project.name}"
							onchange={(e) =>
								run(() =>
									store.updateProject(project.id, {
										description: e.currentTarget.value.trim() || null
									})
								)}
							onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
						/>
						<Swatches
							value={project.color}
							label="Colour of {project.name}"
							onpick={(c) => c && run(() => store.updateProject(project.id, { color: c }))}
						/>
					</div>
					<a class="count muted num" href={resolve('/(app)/projects/[id]', { id: project.id })}
						>{plural(project.count, 'link')}</a
					>
					<div class="tools">
						<button
							id="move-up-{project.id}"
							class="icon-btn"
							type="button"
							aria-label="Move {project.name} up"
							disabled={i === 0}
							onclick={() => move(project, -1)}><Icon name="up" /></button
						>
						<button
							id="move-down-{project.id}"
							class="icon-btn"
							type="button"
							aria-label="Move {project.name} down"
							disabled={i === projects.length - 1}
							onclick={() => move(project, 1)}><Icon name="down" /></button
						>
						<button
							class="icon-btn"
							type="button"
							aria-label="Delete {project.name}"
							onclick={() => (confirming = project.id)}><Icon name="trash" /></button
						>
					</div>
					{#if confirming === project.id}
						<div class="confirm" role="alertdialog" aria-label="Delete {project.name}?">
							<span
								>Delete “{project.name}”? Its {plural(project.count, 'link')}
								{project.count === 1 ? 'stays' : 'stay'}, without this project.</span
							>
							<button class="btn sm negative" type="button" onclick={() => remove(project)}
								>Delete project</button
							>
							<button class="btn sm ghost" type="button" onclick={() => (confirming = null)}
								>Cancel</button
							>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else if $store.organised}
		<p class="empty-card">No projects yet. Make one above.</p>
	{/if}
</main>

<style>
	.page {
		padding: 0 var(--pad) 64px;
		max-width: 960px;
	}
	.title-row {
		padding-top: 32px;
	}
	h1 {
		margin: 0;
		font-size: var(--fs-title);
		font-weight: 500;
		letter-spacing: -0.015em;
	}
	.sub {
		margin: 4px 0 0;
	}
	.new {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 12px;
		margin-top: 20px;
		padding: 16px;
	}
	.new label,
	.colour {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-weight: 500;
	}
	.new em {
		font-style: normal;
		font-weight: 400;
	}
	.grow {
		flex: 1 1 200px;
	}
	.colour {
		min-height: var(--control-height);
	}
	.error {
		margin: 8px 0 0;
		color: var(--negative);
	}
	.list {
		list-style: none;
		margin: 12px 0 0;
		padding: 4px;
	}
	.item {
		position: relative;
		display: grid;
		grid-template-columns: 12px minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 14px;
		padding: 10px 10px;
	}
	.item + .item::before {
		content: '';
		position: absolute;
		left: 6px;
		right: 6px;
		top: 0;
		height: 1px;
		background: var(--rule);
	}
	.dot.big {
		width: 12px;
		height: 12px;
	}
	.fields {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.fields input {
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 2px 6px;
		margin-left: -6px;
		background: none;
		color: inherit;
		outline: none;
	}
	.fields input:hover {
		border-color: var(--border);
	}
	.fields input:focus {
		border-color: var(--text);
	}
	.name {
		font-weight: 500;
	}
	.desc {
		font-size: 13px;
	}
	.count {
		font-size: 13px;
		text-decoration: none;
	}
	.count:hover {
		color: var(--text);
	}
	.tools {
		display: flex;
		gap: 2px;
	}
	.icon-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.confirm {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border-radius: var(--radius-control);
		background: var(--raised);
	}
	.confirm span {
		flex: 1 1 240px;
	}
	.empty-card {
		margin-top: 12px;
	}
	@media (max-width: 759px) {
		.page {
			padding: 0 16px 64px;
		}
		.title-row {
			padding-top: 12px;
		}
		.item {
			grid-template-columns: 12px minmax(0, 1fr) auto;
		}
		.count {
			display: none;
		}
	}
</style>
