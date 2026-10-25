<script lang="ts">
	// The filters a list shows (F-web-mvp "Finding"): the ones set, as chips under the search box, and the panel that
	// sets them (a popover on a wide screen, a sheet on a phone). Any picked value within one filter, all filters
	// together; Tags can ask for every picked tag. Each change applies at once. Loaded on first use, not with the list.
	import { tick } from 'svelte';
	import { MEDIA, MEDIA_LABEL, PRIORITY_LABEL, STATUS_LABEL, type Media } from '#lib/fields.ts';
	import {
		NO_FILTERS,
		PRIORITY_FILTERS,
		PRIORITY_OF,
		SORTS,
		SORT_LABEL,
		STATUS_FILTERS,
		type Archived,
		type Filters,
		type PriorityFilter,
		type StatusFilter
	} from '#lib/search/filters.ts';
	import { store, type View } from '#lib/store/index.ts';
	import Icon from './Icon.svelte';
	import StateMark from './StateMark.svelte';

	let {
		filters,
		view,
		open,
		onchange,
		onclose
	}: {
		filters: Filters;
		view: View;
		open: boolean;
		onchange: (next: Filters) => void;
		onclose: () => void;
	} = $props();

	type ListKey = 'source' | 'media' | 'tags' | 'projects' | 'status' | 'priority';

	const statusWord = (s: StatusFilter) => (s === 'none' ? 'No status' : STATUS_LABEL[s]);
	const priorityWord = (p: PriorityFilter) =>
		p === 'none' ? 'No priority' : PRIORITY_LABEL[PRIORITY_OF[p]!];
	const ARCHIVED_LABEL: Record<Archived, string> = {
		exclude: 'Leave out',
		include: 'Include',
		only: 'Only archived'
	};

	const tagName = (id: string) => $store.tags.find((t) => t.id === id)?.name ?? 'a deleted tag';
	const projectOf = (id: string) => $store.projects.find((p) => p.id === id);
	const sourceName = (id: string) => $store.sources.find((s) => s.id === id)?.name ?? 'a source';
	// On a tag's or project's own page, that tag or project is the page: it is not offered again.
	const tags = $derived($store.tags.filter((t) => !(view.kind === 'tag' && view.id === t.id)));
	const projects = $derived(
		$store.projects.filter((p) => !(view.kind === 'project' && view.id === p.id))
	);

	function toggle(key: ListKey, value: string) {
		const have = filters[key] as string[];
		const next = have.includes(value) ? have.filter((v) => v !== value) : [...have, value];
		onchange({ ...filters, [key]: next });
	}
	const clear = (key: ListKey) => onchange({ ...filters, [key]: [] });
	const clearAll = () => onchange({ ...NO_FILTERS, q: filters.q });

	/** The chips: one per filter set, each saying what it keeps. */
	type Chip = { key: ListKey | 'archived' | 'sort'; label: string; values: string };
	const chips = $derived.by(() => {
		const out: Chip[] = [];
		if (filters.status.length)
			out.push({
				key: 'status',
				label: 'Status',
				values: filters.status.map(statusWord).join(', ')
			});
		if (filters.priority.length)
			out.push({
				key: 'priority',
				label: 'Priority',
				values: filters.priority.map(priorityWord).join(', ')
			});
		if (filters.media.length)
			out.push({
				key: 'media',
				label: 'Media',
				values: filters.media.map((m) => MEDIA_LABEL[m]).join(', ')
			});
		if (filters.tags.length)
			out.push({
				key: 'tags',
				label: filters.tags.length > 1 && filters.tagMode === 'all' ? 'Tags, all of' : 'Tags',
				values: filters.tags.map(tagName).join(', ')
			});
		if (filters.projects.length)
			out.push({
				key: 'projects',
				label: 'Projects',
				values: filters.projects.map((id) => projectOf(id)?.name ?? 'a deleted project').join(', ')
			});
		if (filters.source.length)
			out.push({
				key: 'source',
				label: 'Source',
				values: filters.source.map(sourceName).join(', ')
			});
		if (filters.archived !== 'exclude' && view.kind !== 'archive')
			out.push({
				key: 'archived',
				label: 'Archived',
				values: filters.archived === 'only' ? 'only' : 'included'
			});
		if (filters.sort !== 'saved')
			out.push({ key: 'sort', label: 'Sorted by', values: SORT_LABEL[filters.sort].toLowerCase() });
		return out;
	});
	function drop(chip: Chip) {
		if (chip.key === 'archived') onchange({ ...filters, archived: 'exclude' });
		else if (chip.key === 'sort') onchange({ ...filters, sort: 'saved' });
		else clear(chip.key);
	}

	let panel = $state<HTMLElement | null>(null);
	$effect(() => {
		if (open) tick().then(() => panel?.querySelector<HTMLElement>('input, button')?.focus());
	});
	function onkey(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onclose();
			document.querySelector<HTMLElement>('.filter-btn')?.focus();
		}
	}
</script>

{#if chips.length}
	<div class="chips" aria-label="Filters on">
		{#each chips as chip (chip.key)}
			<span class="chip">
				<span class="chip-text"
					><span class="muted">{chip.label}</span>
					{#if chip.key === 'status'}{#each filters.status as s (s)}<StateMark
								kind="status"
								value={s === 'none' ? null : s}
								size={12}
							/>{/each}{:else if chip.key === 'priority'}{#each filters.priority as p (p)}<StateMark
								kind="priority"
								value={PRIORITY_OF[p]}
								size={12}
							/>{/each}{/if}<span class="vals">{chip.values}</span></span
				>
				<button
					class="chip-x"
					type="button"
					aria-label="Remove {chip.label} {chip.values}"
					onclick={() => drop(chip)}><Icon name="x" size={14} /></button
				>
			</span>
		{/each}
		{#if chips.length > 1}
			<button class="btn ghost sm clear" type="button" onclick={clearAll}>Clear all</button>
		{/if}
	</div>
{/if}

{#if open}
	<button class="scrim filter-scrim" type="button" aria-label="Close the filters" onclick={onclose}
	></button>
	<div class="anchor">
		<div
			class="panel"
			role="dialog"
			aria-modal="false"
			aria-label="Filters"
			tabindex="-1"
			bind:this={panel}
			onkeydown={onkey}
		>
			<div class="grab" aria-hidden="true"></div>
			<div class="head">
				<strong>Filters</strong>
				<span class="muted hint">Any picked value in a group; every group together</span>
				<button class="icon-btn" type="button" aria-label="Close" onclick={onclose}
					><Icon name="x" /></button
				>
			</div>
			<div class="body">
				<fieldset class="group">
					<legend>Status</legend>
					{#each STATUS_FILTERS as s (s)}
						<label class="opt">
							<input
								type="checkbox"
								checked={filters.status.includes(s)}
								onchange={() => toggle('status', s)}
							/>
							<span class="box" aria-hidden="true"><Icon name="check" size={12} /></span>
							<StateMark kind="status" value={s === 'none' ? null : s} />
							<span class="name">{statusWord(s)}</span>
						</label>
					{/each}
				</fieldset>

				<fieldset class="group">
					<legend>Priority</legend>
					{#each PRIORITY_FILTERS as p (p)}
						<label class="opt">
							<input
								type="checkbox"
								checked={filters.priority.includes(p)}
								onchange={() => toggle('priority', p)}
							/>
							<span class="box" aria-hidden="true"><Icon name="check" size={12} /></span>
							<StateMark kind="priority" value={PRIORITY_OF[p]} />
							<span class="name">{priorityWord(p)}</span>
						</label>
					{/each}
				</fieldset>

				<fieldset class="group">
					<legend>Media</legend>
					<div class="scroll">
						{#each MEDIA as m (m)}
							<label class="opt">
								<input
									type="checkbox"
									checked={filters.media.includes(m as Media)}
									onchange={() => toggle('media', m)}
								/>
								<span class="box" aria-hidden="true"><Icon name="check" size={12} /></span>
								<span class="name">{MEDIA_LABEL[m]}</span>
							</label>
						{/each}
					</div>
				</fieldset>

				<fieldset class="group">
					<legend class="with-seg">
						<span>Tags</span>
						<span class="seg tag-mode" role="radiogroup" aria-label="Tags must match">
							<button
								type="button"
								role="radio"
								aria-checked={filters.tagMode === 'any'}
								onclick={() => onchange({ ...filters, tagMode: 'any' })}>Any</button
							>
							<button
								type="button"
								role="radio"
								aria-checked={filters.tagMode === 'all'}
								onclick={() => onchange({ ...filters, tagMode: 'all' })}>All</button
							>
						</span>
					</legend>
					<div class="scroll">
						{#each tags as t (t.id)}
							<label class="opt">
								<input
									type="checkbox"
									checked={filters.tags.includes(t.id)}
									onchange={() => toggle('tags', t.id)}
								/>
								<span class="box" aria-hidden="true"><Icon name="check" size={12} /></span>
								<span class="name">{t.name}</span>
								<span class="n num muted">{t.count}</span>
							</label>
						{:else}
							<p class="none muted">No tags yet</p>
						{/each}
					</div>
				</fieldset>

				<fieldset class="group">
					<legend>Projects</legend>
					<div class="scroll">
						{#each projects as p (p.id)}
							<label class="opt">
								<input
									type="checkbox"
									checked={filters.projects.includes(p.id)}
									onchange={() => toggle('projects', p.id)}
								/>
								<span class="box" aria-hidden="true"><Icon name="check" size={12} /></span>
								<span class="dot" style:--c="var(--dot-{p.color})"></span>
								<span class="name">{p.name}</span>
							</label>
						{:else}
							<p class="none muted">No projects yet</p>
						{/each}
					</div>
				</fieldset>

				<fieldset class="group">
					<legend>Source</legend>
					<div class="scroll">
						{#each $store.sources as src (src.id)}
							<label class="opt">
								<input
									type="checkbox"
									checked={filters.source.includes(src.id)}
									onchange={() => toggle('source', src.id)}
								/>
								<span class="box" aria-hidden="true"><Icon name="check" size={12} /></span>
								<span class="name">{src.name}</span>
							</label>
						{:else}
							<p class="none muted">No sources yet</p>
						{/each}
					</div>
				</fieldset>
			</div>
			<div class="foot">
				{#if view.kind !== 'archive'}
					<div class="foot-item">
						<span class="foot-label" id="archived-label">Archived</span>
						<span class="seg" role="radiogroup" aria-labelledby="archived-label">
							{#each ['exclude', 'include', 'only'] as const as a (a)}
								<button
									type="button"
									role="radio"
									aria-checked={filters.archived === a}
									onclick={() => onchange({ ...filters, archived: a })}>{ARCHIVED_LABEL[a]}</button
								>
							{/each}
						</span>
					</div>
				{/if}
				<label class="foot-item">
					<span class="foot-label">Sort</span>
					<select
						class="field-input select sort"
						value={filters.sort}
						onchange={(e) =>
							onchange({ ...filters, sort: e.currentTarget.value as Filters['sort'] })}
					>
						{#each SORTS as s (s)}<option value={s}>{SORT_LABEL[s]}</option>{/each}
					</select>
				</label>
				<span class="foot-end">
					<button class="btn ghost" type="button" onclick={clearAll}>Clear all</button>
					<button class="btn primary" type="button" onclick={onclose}>Done</button>
				</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 10px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		max-width: 100%;
		height: 28px;
		padding-left: 10px;
		background: var(--surface);
		border: 1px solid var(--control);
		border-radius: var(--radius-control);
		font-size: 13px;
	}
	.chip-text {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
		white-space: nowrap;
	}
	.vals {
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 28ch;
	}
	.chip-x {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		margin-left: 2px;
		border-radius: 4px;
		color: var(--muted);
		cursor: pointer;
	}
	.chip-x:hover {
		color: var(--text);
		background: var(--raised);
	}
	.clear {
		color: var(--muted);
	}

	.filter-scrim {
		background: transparent;
	}
	.anchor {
		position: relative;
		height: 0;
	}
	.panel {
		position: absolute;
		z-index: 32;
		top: 6px;
		left: 0;
		width: min(720px, 100%);
		max-height: min(620px, calc(100dvh - 180px));
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.14);
		outline: none;
	}
	.grab {
		display: none;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 10px 4px 16px;
	}
	.head strong {
		font-weight: 600;
	}
	.hint {
		flex: 1;
		min-width: 0;
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.body {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 4px 16px;
		padding: 4px 10px 12px;
		overflow: auto;
	}
	.group {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	legend {
		display: flex;
		align-items: center;
		width: 100%;
		height: 32px;
		padding: 0 6px;
		margin-top: 8px;
		font-size: 13px;
		font-weight: 500;
		color: var(--muted);
	}
	.with-seg {
		justify-content: space-between;
	}
	.tag-mode button {
		height: 24px;
		padding: 0 8px;
		font-size: 12px;
	}
	.scroll {
		max-height: 196px;
		overflow: auto;
	}
	.opt {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 32px;
		padding: 0 6px;
		border-radius: var(--radius-control);
		cursor: pointer;
	}
	.opt:hover {
		background: var(--raised);
	}
	.opt input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
		pointer-events: none;
	}
	.opt:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.box {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 16px;
		height: 16px;
		border: 1.5px solid var(--control);
		border-radius: 4px;
		color: transparent;
	}
	.opt:has(input:checked) .box {
		background: var(--text);
		border-color: var(--text);
		color: var(--ground);
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
		margin: 6px;
		font-size: 13px;
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 20px;
		padding: 10px 10px 10px 16px;
		border-top: 1px solid var(--rule);
		font-size: 13px;
	}
	.foot-item {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.foot-label {
		color: var(--muted);
		font-weight: 500;
	}
	.sort {
		width: auto;
		height: 32px;
	}
	.foot-end {
		display: flex;
		gap: 6px;
		margin-left: auto;
	}
	.foot-end .btn {
		height: 32px;
	}
	/* The phone: a sheet from the foot of the screen with a grab handle, as the details are (ADR-0005). */
	@media (max-width: 759px) {
		.filter-scrim {
			background: rgb(0 0 0 / 0.34);
		}
		.panel {
			position: fixed;
			top: auto;
			left: 0;
			right: 0;
			bottom: 0;
			width: auto;
			max-height: 88dvh;
			border-radius: 16px 16px 0 0;
			box-shadow: none;
			padding-bottom: env(safe-area-inset-bottom);
		}
		.grab {
			display: block;
			width: 36px;
			height: 4px;
			margin: 8px auto 0;
			border-radius: 2px;
			background: var(--control);
		}
		.hint {
			display: none;
		}
		.head {
			justify-content: space-between;
		}
		.body {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0 8px;
		}
		.opt {
			min-height: 40px;
		}
		.foot {
			gap: 10px 14px;
		}
		.foot-end {
			width: 100%;
		}
		.foot-end .btn {
			flex: 1;
			height: 40px;
		}
		.vals {
			max-width: 18ch;
		}
	}
	@media (prefers-reduced-motion: no-preference) {
		.panel {
			animation: ls-panel-in var(--t-ui) var(--ease-out) both;
		}
		@media (max-width: 759px) {
			.panel {
				animation: ls-sheet-up var(--t-sheet) var(--ease-expo) both;
			}
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.panel {
			animation: ls-fade var(--t-fade-reduced) both;
		}
	}
</style>
