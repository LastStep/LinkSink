<script lang="ts">
	import { resolve } from '$app/paths';
	import { store, StoreError, type TagJson } from '#lib/store/index.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import Swatches from '#lib/ui/Swatches.svelte';
	import { plural } from '#lib/ui/format.ts';

	let error = $state('');
	let clash = $state<{ from: TagJson; into: TagJson } | null>(null);
	let confirming = $state<string | null>(null);
	let merging = $state<string | null>(null);
	let colouring = $state<string | null>(null);

	const tags = $derived($store.tags);

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

	async function rename(tag: TagJson, input: HTMLInputElement) {
		const value = input.value.trim().toLowerCase().replace(/\s+/g, ' ');
		if (!value || value === tag.name) {
			input.value = tag.name;
			return;
		}
		clash = null;
		const other = tags.find((t) => t.name === value);
		if (other) {
			// The name is another tag's: offer the merge instead.
			clash = { from: tag, into: other };
			input.value = tag.name;
			return;
		}
		if (!(await run(() => store.updateTag(tag.id, { name: value })))) input.value = tag.name;
	}

	async function merge(fromId: string, intoId: string) {
		if (await run(() => store.mergeTag(fromId, intoId))) {
			merging = null;
			clash = null;
		}
	}
</script>

<svelte:head><title>Tags · LinkSink</title></svelte:head>

<main class="page" data-ready={$store.organised}>
	<div class="title-row">
		<h1>Tags</h1>
		<p class="muted sub">
			{tags.length
				? plural(tags.length, 'tag')
				: 'Tags are made as you type them in a link’s organiser.'}
		</p>
	</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if clash}
		<div class="confirm" role="alertdialog" aria-label="Merge tags?">
			<span
				>There is already a tag called “{clash.into.name}”. Merge “{clash.from.name}” into it?</span
			>
			<button
				class="btn sm primary"
				type="button"
				onclick={() => merge(clash!.from.id, clash!.into.id)}>Merge</button
			>
			<button class="btn sm ghost" type="button" onclick={() => (clash = null)}>Cancel</button>
		</div>
	{/if}

	{#if tags.length}
		<ul class="card list" aria-label="Tags">
			{#each tags as tag (tag.id)}
				<li class="item">
					<button
						class="dot-btn"
						type="button"
						aria-label="Colour of {tag.name}"
						aria-expanded={colouring === tag.id}
						onclick={() => (colouring = colouring === tag.id ? null : tag.id)}
					>
						{#if tag.color}<span class="dot" style:--c="var(--dot-{tag.color})"></span>{:else}<span
								class="dot empty"
							></span>{/if}
					</button>
					<input
						class="name"
						value={tag.name}
						aria-label="Name of {tag.name}"
						maxlength="64"
						onchange={(e) => rename(tag, e.currentTarget)}
						onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
					/>
					<a class="count muted num" href={resolve('/tags/[id]', { id: tag.id })}
						>{plural(tag.count, 'link')}</a
					>
					<div class="tools">
						<button
							class="btn sm ghost"
							type="button"
							aria-expanded={merging === tag.id}
							disabled={tags.length < 2}
							onclick={() => (merging = merging === tag.id ? null : tag.id)}
							><Icon name="merge" />Merge</button
						>
						<button
							class="icon-btn"
							type="button"
							aria-label="Delete {tag.name}"
							onclick={() => (confirming = tag.id)}><Icon name="trash" /></button
						>
					</div>
					{#if colouring === tag.id}
						<div class="panel">
							<Swatches
								value={tag.color}
								none
								label="Colour of {tag.name}"
								onpick={(c) => {
									run(() => store.updateTag(tag.id, { color: c }));
									colouring = null;
								}}
							/>
						</div>
					{/if}
					{#if merging === tag.id}
						<div class="panel">
							<label>
								Merge “{tag.name}” into
								<select
									class="field-input select"
									aria-label="Merge {tag.name} into"
									onchange={(e) => e.currentTarget.value && merge(tag.id, e.currentTarget.value)}
								>
									<option value="">Choose a tag</option>
									{#each tags.filter((t) => t.id !== tag.id) as other (other.id)}
										<option value={other.id}>{other.name}</option>
									{/each}
								</select>
							</label>
							<span class="muted">Its links get the other tag; “{tag.name}” goes.</span>
						</div>
					{/if}
					{#if confirming === tag.id}
						<div class="panel confirm" role="alertdialog" aria-label="Delete {tag.name}?">
							<span
								>Delete “{tag.name}”? It comes off {plural(tag.count, 'link')}; the links stay.</span
							>
							<button
								class="btn sm negative"
								type="button"
								onclick={async () => {
									if (await run(() => store.deleteTag(tag.id))) confirming = null;
								}}>Delete tag</button
							>
							<button class="btn sm ghost" type="button" onclick={() => (confirming = null)}
								>Cancel</button
							>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.page {
		padding: 0 var(--pad) 64px;
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
	.error {
		margin: 8px 0 0;
		color: var(--negative);
	}
	.list {
		list-style: none;
		margin: 20px 0 0;
		padding: 4px;
	}
	.item {
		position: relative;
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 10px;
		min-height: var(--row-height);
		padding: 2px 6px;
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
	.dot-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-control);
		cursor: pointer;
	}
	.dot-btn:hover {
		background: var(--raised);
	}
	.dot.empty {
		background: none;
		border: 1.5px dashed var(--control);
	}
	.name {
		min-width: 0;
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 4px 6px;
		background: none;
		color: var(--text);
		outline: none;
	}
	.name:hover {
		border-color: var(--border);
	}
	.name:focus {
		border-color: var(--text);
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
		align-items: center;
	}
	.panel {
		grid-column: 2 / -1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		padding: 6px 0 10px;
	}
	.panel label {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.panel select {
		width: auto;
		min-width: 160px;
	}
	.confirm {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		margin-top: 12px;
		border-radius: var(--radius-control);
		background: var(--raised);
	}
	.panel.confirm {
		margin-top: 0;
	}
	.confirm span {
		flex: 1 1 240px;
	}
	@media (max-width: 759px) {
		.page {
			padding: 0 16px 64px;
		}
		.title-row {
			padding-top: 12px;
		}
		.count {
			display: none;
		}
		.item {
			grid-template-columns: 28px minmax(0, 1fr) auto;
		}
		.panel {
			grid-column: 1 / -1;
		}
	}
</style>
