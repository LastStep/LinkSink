<script lang="ts">
	// The organiser: tags (type to find or create), projects, status, priority, and for one link its source and
	// media. Keyboard first: the search box keeps focus, arrows move, Enter toggles or creates, Esc closes.
	import { onMount, tick } from 'svelte';
	import {
		MEDIA,
		MEDIA_LABEL,
		PRIORITIES,
		PRIORITY_LABEL,
		STATUSES,
		STATUS_LABEL
	} from '#lib/fields.ts';
	import { store, StoreError, type BulkInput, type LinkChanges } from '#lib/store/index.ts';
	import Icon from './Icon.svelte';

	let { ids, onclose }: { ids: string[]; onclose: () => void } = $props();

	const links = $derived($store.links.filter((l) => ids.includes(l.id)));
	const single = $derived(ids.length === 1 ? (links[0] ?? null) : null);

	let q = $state('');
	let active = $state(0);
	let error = $state('');
	let input = $state<HTMLInputElement | null>(null);

	const needle = $derived(q.trim().toLowerCase().replace(/\s+/g, ' '));
	const tags = $derived(needle ? $store.tags.filter((t) => t.name.includes(needle)) : $store.tags);
	const projects = $derived(
		needle ? $store.projects.filter((p) => p.name.toLowerCase().includes(needle)) : $store.projects
	);
	const canCreate = $derived(needle.length > 0 && !$store.tags.some((t) => t.name === needle));

	type Option =
		| { kind: 'create'; name: string }
		| { kind: 'tag'; id: string; name: string; count: number }
		| { kind: 'project'; id: string; name: string; color: string };
	// Matches first, so Enter picks the highlighted match; "Create …" comes last and is highlighted (the first option)
	// only when nothing matches, or when the person arrows down to it.
	const options = $derived<Option[]>([
		...tags.map((t) => ({ kind: 'tag' as const, id: t.id, name: t.name, count: t.count })),
		...projects.map((p) => ({ kind: 'project' as const, id: p.id, name: p.name, color: p.color })),
		...(canCreate ? [{ kind: 'create' as const, name: needle }] : [])
	]);
	$effect(() => {
		void needle;
		active = 0;
	});
	$effect(() => {
		if (active >= options.length) active = Math.max(0, options.length - 1);
	});

	/** How many of the links carry a tag or project: 'all', 'some' or 'none'. */
	function coverage(kind: 'tag' | 'project', id: string) {
		const n = links.filter((l) => (kind === 'tag' ? l.tagIds : l.projectIds).includes(id)).length;
		return n === 0 ? 'none' : n === links.length ? 'all' : 'some';
	}

	async function run(fn: () => Promise<unknown>) {
		error = '';
		try {
			await fn();
		} catch (e) {
			error = e instanceof StoreError ? e.message : 'Something went wrong. Try again.';
		}
	}

	function change(changes: Omit<LinkChanges, 'id'>, bulk: Omit<BulkInput, 'ids'>) {
		return run(() =>
			single ? store.put({ id: single.id, ...changes }) : store.bulk({ ids, ...bulk })
		);
	}

	function toggle(kind: 'tag' | 'project', id: string) {
		const on = coverage(kind, id) === 'all';
		if (single) {
			const current = kind === 'tag' ? single.tagIds : single.projectIds;
			const next = on ? current.filter((x) => x !== id) : [...current, id];
			return change(kind === 'tag' ? { tagIds: next } : { projectIds: next }, {});
		}
		const key = `${on ? 'remove' : 'add'}${kind === 'tag' ? 'TagIds' : 'ProjectIds'}` as const;
		return change({}, { [key]: [id] });
	}

	async function choose(option: Option) {
		if (option.kind === 'create') {
			await run(async () => {
				const tag = await store.createTag(option.name);
				q = '';
				await toggle('tag', tag.id);
			});
		} else await toggle(option.kind, option.id);
		input?.focus();
	}

	function onkey(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			active = Math.min(options.length - 1, active + 1);
			scrollActive();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			active = Math.max(0, active - 1);
			scrollActive();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const option = options[active];
			if (option) choose(option);
		}
	}
	async function scrollActive() {
		await tick();
		document.getElementById(`pk-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
	}

	let dialog = $state<HTMLElement | null>(null);

	function onwindowkey(event: KeyboardEvent) {
		if (event.key === 'Tab' && dialog) {
			// Focus stays inside the organiser while it is open.
			const focusable = [
				...dialog.querySelectorAll<HTMLElement>(
					'input:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex="0"]'
				)
			];
			if (focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const inside = dialog.contains(document.activeElement);
			if (event.shiftKey && (document.activeElement === first || !inside)) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && (document.activeElement === last || !inside)) {
				event.preventDefault();
				first.focus();
			}
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onclose();
		}
	}

	const statusValue = $derived(
		single
			? single.status
			: links.every((l) => l.status === links[0]?.status)
				? links[0]?.status
				: undefined
	);
	const priorityValue = $derived(
		single
			? single.priority
			: links.every((l) => l.priority === links[0]?.priority)
				? links[0]?.priority
				: undefined
	);

	onMount(() => input?.focus());
</script>

<svelte:window onkeydown={onwindowkey} />

<button class="scrim picker-scrim" type="button" aria-label="Close the organiser" onclick={onclose}
></button>
<div
	bind:this={dialog}
	class="picker"
	role="dialog"
	aria-modal="true"
	aria-label={single ? `Organise ${single.title ?? single.url}` : `Organise ${ids.length} links`}
>
	<div class="head">
		<strong>Organise</strong>
		<span class="muted what">{single ? (single.title ?? single.url) : `${ids.length} links`}</span>
		<button class="icon-btn" type="button" aria-label="Close" onclick={onclose}
			><Icon name="x" /></button
		>
	</div>
	<div class="body">
		<label class="find">
			<Icon name="search" />
			<input
				bind:this={input}
				bind:value={q}
				onkeydown={onkey}
				role="combobox"
				aria-expanded="true"
				aria-controls="pk-options"
				aria-activedescendant={options.length ? `pk-opt-${active}` : undefined}
				aria-label="Find or create a tag"
				placeholder="Find or create a tag"
				autocomplete="off"
			/>
		</label>
		<div
			id="pk-options"
			class="options"
			role="listbox"
			aria-multiselectable="true"
			aria-label="Tags and projects"
		>
			{#each options as option, i (option.kind + ('id' in option ? option.id : option.name))}
				{#if option.kind === 'project' && (i === 0 || options[i - 1].kind !== 'project')}
					<p class="group" role="presentation">Projects</p>
				{:else if option.kind === 'create' && i > 0}
					<p class="group" role="presentation">New tag</p>
				{:else if option.kind !== 'project' && i === 0}
					<p class="group" role="presentation">Tags</p>
				{/if}
				{@const s = option.kind === 'create' ? 'none' : coverage(option.kind, option.id)}
				<div
					id="pk-opt-{i}"
					class="opt s-{s}"
					class:active={i === active}
					role="option"
					tabindex="-1"
					aria-selected={s === 'all'}
					aria-checked={s === 'some' ? 'mixed' : s === 'all'}
					onpointerdown={(e) => e.preventDefault()}
					onclick={() => {
						active = i;
						choose(option);
					}}
					onkeydown={() => {}}
				>
					{#if option.kind === 'create'}
						<Icon name="plus" />
						<span>Create tag “{option.name}”</span>
					{:else}
						<span class="box" aria-hidden="true">
							{#if s === 'all'}<Icon name="check" size={12} />{:else if s === 'some'}<span
									class="dash"
								></span>{/if}
						</span>
						{#if option.kind === 'project'}<span class="dot" style:--c="var(--dot-{option.color})"
							></span>{/if}
						<span class="name">{option.name}</span>
						{#if option.kind === 'tag'}<span class="n num muted">{option.count}</span>{/if}
					{/if}
				</div>
			{:else}
				<p class="none muted">No tags or projects yet. Type a name to make a tag.</p>
			{/each}
		</div>

		<div class="values">
			<p class="group">Status</p>
			<div class="seg" role="radiogroup" aria-label="Status">
				<button
					type="button"
					role="radio"
					aria-checked={statusValue === null}
					onclick={() => change({ status: null }, { status: null })}>None</button
				>
				{#each STATUSES as status (status)}
					<button
						type="button"
						role="radio"
						aria-checked={statusValue === status}
						onclick={() => change({ status }, { status })}>{STATUS_LABEL[status]}</button
					>
				{/each}
			</div>
			<p class="group">Priority</p>
			<div class="seg" role="radiogroup" aria-label="Priority">
				<button
					type="button"
					role="radio"
					aria-checked={priorityValue === null}
					onclick={() => change({ priority: null }, { priority: null })}>None</button
				>
				{#each PRIORITIES as priority (priority)}
					<button
						type="button"
						role="radio"
						aria-checked={priorityValue === priority}
						onclick={() => change({ priority }, { priority })}>{PRIORITY_LABEL[priority]}</button
					>
				{/each}
			</div>
			{#if single}
				<div class="two">
					<label>
						<span class="group">Source</span>
						<select
							class="field-input select"
							value={single.sourceId ?? ''}
							onchange={(e) => change({ sourceId: e.currentTarget.value || null }, {})}
						>
							<option value="" disabled>None yet</option>
							{#each $store.sources as source (source.id)}
								<option value={source.id}>{source.name}</option>
							{/each}
						</select>
					</label>
					<label>
						<span class="group">Media</span>
						<select
							class="field-input select"
							value={single.media ?? ''}
							onchange={(e) => change({ media: e.currentTarget.value }, {})}
						>
							<option value="" disabled>Not known yet</option>
							{#each MEDIA as media (media)}
								<option value={media}>{MEDIA_LABEL[media]}</option>
							{/each}
						</select>
					</label>
				</div>
			{/if}
		</div>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</div>
	<div class="foot">
		<span class="muted">Changes save as you make them</span>
		<button class="btn primary" type="button" onclick={onclose}>Done</button>
	</div>
</div>

<style>
	.picker-scrim {
		background: rgb(0 0 0 / 0.12);
	}
	.picker {
		position: fixed;
		z-index: 32;
		top: 72px;
		right: 24px;
		width: 380px;
		max-height: min(640px, calc(100dvh - 96px));
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.14);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 10px 8px 16px;
	}
	.head strong {
		font-weight: 600;
	}
	.what {
		flex: 1;
		min-width: 0;
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.body {
		overflow: auto;
		padding: 0 10px 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.body > * {
		flex: none;
	}
	.find {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 10px;
		border: 1px solid var(--control);
		border-radius: var(--radius-control);
		color: var(--muted);
	}
	.find:focus-within {
		border-color: var(--text);
	}
	.find input {
		flex: 1;
		min-width: 0;
		height: 100%;
		border: 0;
		outline: none;
		background: none;
		color: var(--text);
	}
	.options {
		display: flex;
		flex-direction: column;
	}
	.group {
		margin: 8px 6px 4px;
		font-size: 13px;
		font-weight: 500;
		color: var(--muted);
	}
	.opt {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 34px;
		padding: 0 8px;
		border-radius: var(--radius-control);
		cursor: pointer;
	}
	.opt:hover {
		background: var(--raised);
	}
	.opt.active {
		background: var(--active);
	}
	.box {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border: 1.5px solid var(--control);
		border-radius: 4px;
		flex: none;
	}
	.opt.s-all .box {
		background: var(--text);
		border-color: var(--text);
		color: var(--ground);
	}
	.dash {
		width: 8px;
		height: 2px;
		background: var(--text);
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.n {
		font-size: var(--fs-small);
	}
	.none {
		margin: 8px 6px;
	}
	.values {
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-top: 1px solid var(--rule);
		padding-top: 4px;
	}
	.values .seg {
		margin: 0 6px;
		align-self: flex-start;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin: 0 6px;
	}
	.two label {
		display: flex;
		flex-direction: column;
	}
	.two .group {
		margin-left: 0;
	}
	.error {
		margin: 4px 6px 0;
		color: var(--negative);
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 10px 10px 16px;
		border-top: 1px solid var(--rule);
		font-size: 13px;
	}
	.foot .btn {
		height: 32px;
	}
	@media (max-width: 759px) {
		.picker {
			top: auto;
			left: 0;
			right: 0;
			bottom: 0;
			width: auto;
			max-height: 88dvh;
			border-radius: 16px 16px 0 0;
			box-shadow: none;
		}
		.picker-scrim {
			background: rgb(0 0 0 / 0.34);
		}
	}
	@media (prefers-reduced-motion: no-preference) {
		.picker {
			animation: ls-panel-in var(--t-ui) var(--ease-out) both;
		}
		@media (max-width: 759px) {
			.picker {
				animation: ls-sheet-up var(--t-sheet) var(--ease-expo) both;
			}
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.picker {
			animation: ls-fade var(--t-fade-reduced) both;
		}
	}
</style>
