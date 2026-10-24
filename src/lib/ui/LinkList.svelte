<script lang="ts">
	// A list of links as a day ledger (ADR-0003): Links, Unsorted, Archive, one project or one tag. Paste anywhere to
	// save; a row opens its details; select many (x, shift-click, long-press) to organise, archive or delete at once.
	import { onMount, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { page } from '$app/state';
	import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type Status } from '#lib/fields.ts';
	import { listenForPastes } from '#lib/paste.ts';
	import { store, StoreError, type StoreLink, type View } from '#lib/store/index.ts';
	import { displayHost } from '#lib/url.ts';
	import { byDay, plural, timeOf } from './format.ts';
	import Icon from './Icon.svelte';

	let {
		view,
		title,
		sub = '',
		empty
	}: { view: View; title: string; sub?: string; empty: string } = $props();

	// The details, the organiser and the bulk bar load on first use, not with the list (the first-load budget).
	const loadDetail = () => import('./Detail.svelte');
	const loadPicker = () => import('./Picker.svelte');
	const loadBulkBar = () => import('./BulkBar.svelte');

	/** How long an undo stays offered. */
	const UNDO_MS = 5000;

	const q = $derived(page.url.searchParams.get('q')?.trim() ?? '');
	const canPaste = $derived(view.kind !== 'archive');

	let url = $state('');
	let typedTitle = $state('');
	let message = $state('');
	let notice = $state('');
	let flashed = $state<string | null>(null);
	let toast = $state<{ text: string; undo: () => Promise<unknown> } | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	let box = $state<HTMLInputElement | null>(null);
	let listening = $state(false);

	let openId = $state<string | null>(null);
	let pickerIds = $state<string[] | null>(null);
	let selecting = $state(false);
	const selected = new SvelteSet<string>();
	let anchor = $state<string | null>(null);

	const links = $derived($store.links);
	const open = $derived(openId ? (links.find((l) => l.id === openId) ?? null) : null);
	const days = $derived(byDay(links, (l) => l.createdAt));
	const tagById = $derived(new Map($store.tags.map((t) => [t.id, t])));
	const projectById = $derived(new Map($store.projects.map((p) => [p.id, p])));
	const sourceById = $derived(new Map($store.sources.map((s) => [s.id, s])));

	$effect(() => {
		const v = view;
		const query = q;
		openId = null;
		selected.clear();
		selecting = false;
		store.list(query, v).catch(showError);
	});

	onMount(() => {
		const stop = listenForPastes(
			(pasted) => {
				if (!canPaste) return;
				// Pasted into the box: the title typed beside it goes with it.
				const typed = document.activeElement === box ? typedTitle : '';
				if (typed) typedTitle = '';
				save(pasted, typed);
			},
			() => box
		);
		listening = true;
		return stop;
	});

	function showError(error: unknown) {
		message = error instanceof StoreError ? error.message : 'Something went wrong. Try again.';
	}

	function offerUndo(text: string, undo: () => Promise<unknown>) {
		clearTimeout(toastTimer);
		toast = { text, undo };
		toastTimer = setTimeout(() => (toast = null), UNDO_MS);
	}
	async function runUndo() {
		if (!toast) return;
		const { undo } = toast;
		clearTimeout(toastTimer);
		toast = null;
		try {
			await undo();
			store.refresh().catch(() => {});
		} catch (error) {
			showError(error);
		}
	}

	async function save(link: string, typed = '') {
		message = '';
		notice = '';
		try {
			const result = await store.put({ url: link, title: typed || null, via: 'paste' });
			if (result.duplicate) {
				notice = 'Already saved.';
				flashed = result.link.id;
				setTimeout(() => {
					if (flashed === result.link.id) flashed = null;
				}, 2000);
				document.getElementById(`link-${result.link.id}`)?.scrollIntoView({ block: 'nearest' });
			}
		} catch (error) {
			showError(error);
		}
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const link = url;
		const typed = typedTitle;
		url = '';
		typedTitle = '';
		save(link, typed);
	}

	const name = (link: StoreLink) => link.title || displayHost(link.url);

	async function remove(link: StoreLink) {
		message = '';
		if (openId === link.id) openId = null;
		try {
			await store.remove(link.id);
			offerUndo(`Deleted “${name(link)}”.`, () => store.restore(link.id));
			store.refresh().catch(() => {});
		} catch (error) {
			showError(error);
		}
	}

	async function archive(link: StoreLink) {
		message = '';
		const archived = link.archivedAt === null;
		if (openId === link.id) openId = null;
		try {
			await store.put({ id: link.id, archived });
			offerUndo(`${archived ? 'Archived' : 'Restored'} “${name(link)}”.`, () =>
				store.put({ id: link.id, archived: !archived })
			);
		} catch (error) {
			showError(error);
		}
	}

	// ---------- selection ----------
	const flat = $derived(days.flatMap((d) => d.items));

	function toggleSelect(id: string, range = false) {
		selecting = true;
		if (range && anchor) {
			const a = flat.findIndex((l) => l.id === anchor);
			const b = flat.findIndex((l) => l.id === id);
			if (a >= 0 && b >= 0) {
				const [from, to] = a < b ? [a, b] : [b, a];
				for (const l of flat.slice(from, to + 1)) if (!l.pending) selected.add(l.id);
				return;
			}
		}
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
		anchor = id;
	}

	function endSelect() {
		selecting = false;
		selected.clear();
		anchor = null;
	}

	async function bulkArchive() {
		const ids = [...selected];
		const archived = view.kind !== 'archive';
		try {
			await store.bulk({ ids, archived });
			endSelect();
			offerUndo(`${archived ? 'Archived' : 'Restored'} ${plural(ids.length, 'link')}.`, () =>
				store.bulk({ ids, archived: !archived }).then(() => store.list(q, view))
			);
		} catch (error) {
			showError(error);
		}
	}

	async function bulkDelete() {
		const ids = [...selected];
		try {
			await store.bulk({ ids, deleted: true });
			endSelect();
			offerUndo(`Deleted ${plural(ids.length, 'link')}.`, async () => {
				for (const id of ids) await store.restore(id);
			});
		} catch (error) {
			showError(error);
		}
	}

	// ---------- rows: click, keys, long-press ----------
	/** Rows already warmed (not shown, so not reactive). */
	const warmed: Record<string, true> = {};
	/** On hover or focus of a row: fetch the details' code and picture, so they open at once. */
	function warm(link: StoreLink) {
		if (link.pending || warmed[link.id]) return;
		warmed[link.id] = true;
		loadDetail();
		if (link.imagePath) new Image().src = `/media/${link.imagePath}`;
	}

	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	let pressed = false;

	function rowClick(event: MouseEvent, link: StoreLink) {
		if (pressed) {
			pressed = false;
			return;
		}
		if ((event.target as Element).closest('a, button, input')) return;
		if (link.pending) return;
		if (selecting || event.shiftKey || event.metaKey || event.ctrlKey) {
			event.preventDefault();
			toggleSelect(link.id, event.shiftKey);
			return;
		}
		openId = openId === link.id ? null : link.id;
	}

	function rowKey(event: KeyboardEvent, link: StoreLink) {
		if (event.target !== event.currentTarget) return;
		if (event.key === 'Enter') {
			event.preventDefault();
			openId = link.id;
		} else if (event.key === 'x' && !link.pending) {
			event.preventDefault();
			toggleSelect(link.id, event.shiftKey);
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const rows = [...document.querySelectorAll<HTMLElement>('li.row')];
			const i = rows.indexOf(event.currentTarget as HTMLElement);
			rows[
				event.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1)
			]?.focus();
		}
	}

	function pressStart(event: PointerEvent, link: StoreLink) {
		if (event.pointerType !== 'touch' || link.pending) return;
		clearTimeout(pressTimer);
		pressTimer = setTimeout(() => {
			pressed = true;
			navigator.vibrate?.(10);
			toggleSelect(link.id);
		}, 450);
	}
	const pressEnd = () => clearTimeout(pressTimer);

	function onwindowkey(event: KeyboardEvent) {
		if (event.key !== 'Escape' || pickerIds) return;
		if (openId) openId = null;
		else if (selecting) endSelect();
	}

	async function organise(ids: string[]) {
		pickerIds = ids;
	}
	async function closePicker() {
		const ids = pickerIds;
		pickerIds = null;
		await tick();
		if (ids?.length === 1) document.getElementById(`link-${ids[0]}`)?.focus();
	}
</script>

<svelte:window onkeydown={onwindowkey} />

<div class="screen" class:has-detail={open}>
	<main class="page" data-ready={listening && !$store.loading}>
		<div class="title-row">
			<div>
				<h1>{title}</h1>
				{#if sub}<p class="sub muted">{sub}</p>{/if}
			</div>
			{#if links.length}
				<button
					class="btn ghost"
					type="button"
					aria-pressed={selecting}
					onclick={() => (selecting ? endSelect() : (selecting = true))}
					>{selecting ? 'Cancel' : 'Select'}</button
				>
			{/if}
		</div>

		{#if canPaste}
			<form class="paste" onsubmit={submit}>
				<span class="paste-icon"><Icon name="link" /></span>
				<input
					bind:this={box}
					bind:value={url}
					name="url"
					type="url"
					placeholder="Paste a link to save it"
					aria-label="Link"
					required
				/>
				{#if url}
					<input
						class="title-in"
						bind:value={typedTitle}
						name="title"
						placeholder="Title (optional)"
						aria-label="Title"
					/>
				{/if}
				<button class="btn primary" type="submit">Save</button>
			</form>
		{/if}
		{#if message}<p class="error" role="alert">{message}</p>{/if}
		{#if notice}<p class="notice muted" role="status">{notice}</p>{/if}

		<div class="toolbar">
			<form class="search" method="get" role="search">
				<Icon name="search" />
				<input name="q" type="search" placeholder="Search" aria-label="Search" value={q} />
			</form>
			<span class="count muted num">{plural(links.filter((l) => !l.pending).length, 'link')}</span>
		</div>

		{#if links.length > 0}
			<ul class="ledger" aria-label="Links" class:selecting>
				{#each days as day (day.key)}
					<!-- Rows are the list's own children (one list for the whole ledger); each day's heading sits
					     between them, and the day's card is drawn from its rows' backgrounds. -->
					<li class="day-h" role="none">
						<h2>{day.label} <span class="n muted num">{day.items.length}</span></h2>
					</li>
					{#each day.items as link, i (link.id)}
						{@const source = link.sourceId ? sourceById.get(link.sourceId) : undefined}
						{@const rowTags = link.tagIds
							.map((id) => tagById.get(id))
							.filter((t) => t !== undefined)}
						{@const rowProjects = link.projectIds
							.map((id) => projectById.get(id))
							.filter((p) => p !== undefined)}
						<!-- A row is a listitem the keyboard can reach (Enter opens it, x selects it); its link and buttons
								     stay the real controls. -->
						<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
						<li
							class="row"
							class:last={i === day.items.length - 1}
							id="link-{link.id}"
							class:pending={link.pending}
							class:flash={flashed === link.id}
							class:open={openId === link.id}
							class:selected={selected.has(link.id)}
							data-state={link.pending ? 'saving' : 'saved'}
							data-meta={link.metaState}
							tabindex="0"
							onclick={(e) => rowClick(e, link)}
							onkeydown={(e) => rowKey(e, link)}
							onpointerenter={() => warm(link)}
							onfocus={() => warm(link)}
							onpointerdown={(e) => pressStart(e, link)}
							onpointerup={pressEnd}
							onpointercancel={pressEnd}
							onpointermove={pressEnd}
							oncontextmenu={(e) => pressed && e.preventDefault()}
						>
							{#if selecting}
								<input
									class="chk"
									type="checkbox"
									aria-label="Select {name(link)}"
									checked={selected.has(link.id)}
									disabled={link.pending}
									onclick={(e) => {
										// The box follows the selection (a shift-click can select a range).
										toggleSelect(link.id, e.shiftKey);
										e.currentTarget.checked = selected.has(link.id);
									}}
								/>
							{/if}
							{#if link.faviconPath}
								<img class="icon" src="/media/{link.faviconPath}" alt="" width="16" height="16" />
							{:else}
								<span class="icon blank" aria-hidden="true"
									>{displayHost(link.url).charAt(0).toUpperCase()}</span
								>
							{/if}
							<span class="c-title">
								<!-- eslint-disable svelte/no-navigation-without-resolve -- a saved link points off-site -->
								<a
									class="t"
									href={link.url}
									rel="noopener noreferrer"
									target="_blank"
									onclick={() => !link.pending && store.opened(link.id).catch(() => {})}
									>{link.title || link.url}</a
								>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
								<span class="sub-line muted">
									{#each rowProjects as p (p.id)}<span class="dot" style:--c="var(--dot-{p.color})"
										></span>{/each}
									{link.pending
										? 'Saving…'
										: [source?.name ?? displayHost(link.url), ...rowTags.map((t) => t.name)].join(
												' · '
											)}
								</span>
							</span>
							<span class="c-tags">
								{#each rowTags.slice(0, 3) as t (t.id)}<span class="tag-chip">{t.name}</span>{/each}
								{#if rowTags.length > 3}<span class="tag-chip">+{rowTags.length - 3}</span>{/if}
							</span>
							<span
								class="c-proj"
								aria-label={rowProjects.map((p) => p.name).join(', ') || undefined}
							>
								{#each rowProjects as p (p.id)}<span
										class="dot"
										title={p.name}
										style:--c="var(--dot-{p.color})"
									></span>{/each}
							</span>
							<span class="c-status">
								{#if link.status}<span class="pill {link.status}"
										>{STATUS_LABEL[link.status as Status]}</span
									>{/if}
								{#if link.priority && link.priority > 1}<span class="prio p{link.priority}"
										><Icon name="flag" size={12} />{PRIORITY_LABEL[link.priority as Priority]}</span
									>{/if}
							</span>
							<time class="c-time muted num" datetime={new Date(link.createdAt).toISOString()}
								>{timeOf(link.createdAt)}</time
							>
							<span class="c-act">
								<button
									class="icon-btn"
									type="button"
									aria-label="Organise {name(link)}"
									disabled={link.pending}
									onclick={() => organise([link.id])}><Icon name="tag" /></button
								>
								<button
									class="icon-btn"
									type="button"
									aria-label="{link.archivedAt ? 'Restore' : 'Archive'} {name(link)}"
									disabled={link.pending}
									onclick={() => archive(link)}><Icon name="archive" /></button
								>
								<button
									class="icon-btn del"
									type="button"
									aria-label="Delete {name(link)}"
									disabled={link.pending}
									onclick={() => remove(link)}><Icon name="trash" /></button
								>
							</span>
						</li>
					{/each}
				{/each}
			</ul>
		{:else if !$store.loading}
			<p class="empty-card">{q ? `Nothing matches “${q}”.` : empty}</p>
		{/if}

		{#if selecting}
			{#await loadBulkBar() then { default: BulkBar }}
				<BulkBar
					count={selected.size}
					archive={view.kind === 'archive'}
					onall={() => flat.forEach((l) => !l.pending && selected.add(l.id))}
					onorganise={() => organise([...selected])}
					onarchive={bulkArchive}
					ondelete={bulkDelete}
					ondone={endSelect}
				/>
			{/await}
		{/if}
	</main>

	{#if open}
		{#await loadDetail() then { default: Detail }}
			{#key open.id}
				<Detail
					link={open}
					onclose={() => (openId = null)}
					onorganise={() => organise([open.id])}
					onarchive={() => archive(open)}
					ondelete={() => remove(open)}
				/>
			{/key}
		{/await}
	{/if}
</div>

{#if pickerIds}
	{#await loadPicker() then { default: Picker }}
		<Picker ids={pickerIds} onclose={closePicker} />
	{/await}
{/if}

{#if toast}
	<div class="toast" role="status">
		<span>{toast.text}</span>
		<button class="undo" type="button" onclick={runUndo}>Undo</button>
	</div>
{/if}

<style>
	.screen {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		min-height: 100%;
	}
	.screen.has-detail {
		grid-template-columns: minmax(0, 1fr) var(--detail-width);
	}
	.page {
		min-width: 0;
		padding: 0 var(--pad) 96px;
		display: flex;
		flex-direction: column;
	}
	.title-row {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		padding-top: 32px;
	}
	h1 {
		margin: 0;
		font-size: var(--fs-title);
		line-height: 1.15;
		font-weight: 500;
		letter-spacing: -0.015em;
	}
	.sub {
		margin: 4px 0 0;
	}
	.paste {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 20px;
		height: 44px;
		padding: 0 6px 0 12px;
		background: var(--surface);
		border: 1px solid var(--control);
		border-radius: var(--radius-control);
	}
	.paste:focus-within {
		border-color: var(--text);
	}
	.paste-icon {
		display: inline-flex;
		color: var(--muted);
	}
	.paste input {
		flex: 1;
		min-width: 0;
		height: 100%;
		border: 0;
		outline: none;
		background: none;
		color: var(--text);
	}
	.paste input::placeholder {
		color: var(--faint);
	}
	.paste .title-in {
		flex: 0 1 220px;
		padding-left: 10px;
		border-left: 1px solid var(--rule);
	}
	.paste .btn {
		height: 32px;
	}
	.error {
		margin: 8px 0 0;
		color: var(--negative);
	}
	.notice {
		margin: 8px 0 0;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-top: 16px;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 260px;
		height: 32px;
		padding: 0 10px;
		background: var(--surface);
		border: 1px solid var(--control);
		border-radius: var(--radius-control);
		color: var(--muted);
	}
	.search:focus-within {
		border-color: var(--text);
	}
	.search input {
		flex: 1;
		min-width: 0;
		height: 100%;
		border: 0;
		outline: none;
		background: none;
		color: var(--text);
	}
	.count {
		margin-left: auto;
		font-size: 13px;
	}
	.ledger {
		list-style: none;
		margin: 20px 0 0;
		padding: 0;
	}
	.day-h {
		margin-top: var(--gap);
		padding: 12px 14px 8px;
		background: var(--surface);
		border-radius: var(--radius-card) var(--radius-card) 0 0;
	}
	.day-h:first-child {
		margin-top: 0;
	}
	.day-h h2 {
		margin: 0;
		font-size: 14px;
		font-weight: 500;
	}
	.day-h .n {
		margin-left: 6px;
		font-size: 13px;
		font-weight: 400;
	}
	.row {
		position: relative;
		isolation: isolate;
		display: grid;
		grid-template-columns: 16px minmax(0, 1fr) auto auto auto 44px 0;
		align-items: center;
		gap: 14px;
		min-height: var(--row-height);
		padding: 0 14px;
		background: var(--surface);
		cursor: pointer;
		outline-offset: -2px;
	}
	.row.last {
		min-height: calc(var(--row-height) + 4px);
		padding-bottom: 4px;
		border-radius: 0 0 var(--radius-card) var(--radius-card);
	}
	.selecting .row {
		grid-template-columns: 16px 16px minmax(0, 1fr) auto auto auto 44px 0;
	}
	/* the ruled line between rows of a day */
	.row:not(.day-h + .row)::before {
		content: '';
		position: absolute;
		left: 10px;
		right: 10px;
		top: 0;
		height: 1px;
		background: var(--rule);
	}
	/* hover, open and selected: a 4 px inset tint inside the day's card */
	.row::after {
		content: '';
		position: absolute;
		z-index: -1;
		inset: 0 4px;
		border-radius: 4px;
		background: transparent;
		transition: background-color var(--t-hover) var(--ease-out);
	}
	.row.last::after {
		bottom: 4px;
	}
	.row:hover::after,
	.row:focus-within::after {
		background: var(--raised);
	}
	.row.open::after,
	.row.selected::after {
		background: var(--active);
	}
	.row:hover::before,
	.row:hover + .row::before,
	.row.open::before,
	.row.open + .row::before,
	.row.selected::before,
	.row.selected + .row::before {
		opacity: 0;
	}
	.chk {
		width: 16px;
		height: 16px;
		margin: 0;
		accent-color: var(--text);
	}
	.icon {
		width: 16px;
		height: 16px;
		border-radius: 3px;
		object-fit: contain;
	}
	.icon.blank {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--raised);
		color: var(--muted);
		font-size: 10px;
		font-weight: 600;
	}
	.c-title {
		min-width: 0;
	}
	/* Only the title's text opens the site; the rest of the row opens the details. */
	.t {
		display: inline-block;
		max-width: 100%;
		vertical-align: top;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
		font-weight: 450;
		text-decoration: none;
	}
	.t:hover {
		text-decoration: underline;
		text-decoration-color: var(--control);
		text-underline-offset: 3px;
	}
	.sub-line {
		display: none;
	}
	.c-tags,
	.c-proj,
	.c-status {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.c-status {
		gap: 8px;
	}
	.c-time {
		text-align: right;
		font-size: 13px;
	}
	.c-act {
		position: absolute;
		right: 6px;
		top: 50%;
		translate: 0 -50%;
		display: flex;
		gap: 2px;
		padding-left: 8px;
		background: var(--raised);
		border-radius: 4px;
		opacity: 0;
		transition: opacity var(--t-hover) var(--ease-out);
	}
	.row:hover .c-act,
	.row:focus-within .c-act,
	.row.open .c-act {
		opacity: 1;
	}
	.row.open .c-act,
	.row.selected .c-act {
		background: var(--active);
	}
	.c-act .icon-btn {
		width: 28px;
		height: 28px;
	}
	.c-act .icon-btn:disabled {
		visibility: hidden;
	}
	.row.pending .t {
		color: var(--accent);
	}
	/* The existing row a duplicate paste points at: a tint with the accent hue at its edge (direction A); the title
	   keeps --text on it. */
	.row.flash {
		background: var(--active);
		box-shadow: inset 2px 0 0 var(--accent);
	}
	.row.flash::after {
		background: transparent;
	}
	.row.flash .t {
		color: var(--text);
	}
	.empty-card {
		margin: 20px 0 0;
	}
	@media (prefers-reduced-motion: no-preference) {
		.row {
			animation: ls-rise var(--t-rise) var(--ease-out) both;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.row {
			animation: ls-fade var(--t-fade-reduced) both;
		}
	}
	@media (max-width: 1099px) {
		.screen.has-detail {
			grid-template-columns: minmax(0, 1fr);
		}
		.title-row {
			padding-top: 16px;
		}
	}
	@media (max-width: 759px) {
		.page {
			--pad: 16px;
			padding: 0 16px 96px;
		}
		.title-row {
			padding-top: 12px;
		}
		h1 {
			font-size: 22px;
		}
		.paste {
			margin-top: 14px;
			flex-wrap: wrap;
			height: auto;
			min-height: 44px;
			padding: 4px 6px 4px 12px;
		}
		.paste input {
			height: 34px;
		}
		.paste .title-in {
			order: 3;
			flex: 1 1 100%;
			border-left: 0;
			border-top: 1px solid var(--rule);
			padding-left: 0;
		}
		.search {
			flex: 1;
			width: auto;
		}
		.row,
		.selecting .row {
			grid-template-columns: 16px minmax(0, 1fr) auto;
			grid-template-rows: auto auto;
			align-items: start;
			gap: 2px 10px;
			padding: 10px 14px;
		}
		.row.last {
			padding-bottom: 14px;
		}
		.selecting .row {
			grid-template-columns: 16px 16px minmax(0, 1fr) auto;
		}
		.icon {
			grid-column: 1;
			grid-row: 1;
			margin-top: 2px;
		}
		.c-title {
			grid-column: 2;
			grid-row: 1 / 3;
		}
		.chk {
			grid-column: 1;
			grid-row: 1;
			margin-top: 2px;
		}
		.selecting .icon {
			grid-column: 2;
		}
		.selecting .c-title {
			grid-column: 3;
		}
		.t {
			white-space: normal;
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
		}
		.sub-line {
			display: block;
			margin-top: 2px;
			font-size: 13px;
			line-height: 18px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.sub-line .dot {
			width: 7px;
			height: 7px;
			margin-right: 3px;
		}
		.c-tags,
		.c-proj,
		.c-act {
			display: none;
		}
		.c-status {
			grid-column: -2;
			grid-row: 1;
			justify-content: flex-end;
		}
		.c-time {
			grid-column: -2;
			grid-row: 2;
			align-self: end;
		}
		.toolbar .count {
			display: none;
		}
	}
</style>
