<script lang="ts">
	// A list of links as a day ledger (ADR-0003): Links, Unsorted, Archive, one project or one tag. Paste anywhere to
	// save; a row opens its details; select many (x, shift-click, long-press) to organise, archive or delete at once.
	import { onMount, tick, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type Status } from '#lib/fields.ts';
	import { listenForPastes } from '#lib/paste.ts';
	import {
		filterCount,
		filterQuery,
		parseFilters,
		sameFilters,
		type Filters
	} from '#lib/search/filters.ts';
	import { parseQuery } from '#lib/search/query.ts';
	import { belongsToList, store, StoreError, type StoreLink, type View } from '#lib/store/index.ts';
	import { displayHost } from '#lib/url.ts';
	import { byDay, plural, shortDate, timeOf } from './format.ts';
	import Icon from './Icon.svelte';
	import StateMark from './StateMark.svelte';

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
	const loadFilters = () => import('./FilterPanel.svelte');

	/** How long the search waits after a keystroke before it asks (the plan's 100 ms). */
	const DEBOUNCE_MS = 100;

	/** How long an undo stays offered. */
	const UNDO_MS = 5000;

	// The list's search, filters and sort live in the address (src/lib/search/filters.ts), so a reload or a bookmark
	// brings the same view back. `filters` is what the list shows; `typed` is the search box, which runs ahead of it
	// by the debounce while the person types.
	let filters = $state.raw<Filters>(parseFilters(page.url.searchParams));
	let typed = $state(untrack(() => filters.q));
	let typingTimer: ReturnType<typeof setTimeout> | undefined;
	let searchBox = $state<HTMLInputElement | null>(null);
	let panelOpen = $state(false);
	const q = $derived(filters.q);
	const terms = $derived(parseQuery(filters.q));
	const narrowed = $derived(filterCount(filters) > 0 || Boolean(filters.q.trim()));
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
	let pickerKind = $state<'tag' | 'project' | undefined>(undefined);
	let selecting = $state(false);
	const selected = new SvelteSet<string>();
	let anchor = $state<string | null>(null);

	// The rows follow the store: a link whose tags, projects or archive state no longer fit this view leaves the list at
	// once. The link that is open stays in the store (hold), so its details and organiser keep working.
	const links = $derived(
		$store.links.filter((l) => l.pending || belongsToList(view, filters, l, terms))
	);
	const open = $derived(openId ? ($store.links.find((l) => l.id === openId) ?? null) : null);
	$effect(() => {
		store.hold([...(openId ? [openId] : []), ...(pickerIds ?? [])]);
	});
	/** The list's groups: days saved (or edited) for those sorts, priorities for priority, one A to Z group for title. */
	const days = $derived.by(() => {
		switch (filters.sort) {
			case 'edited':
				return byDay(links, (l) => l.updatedAt);
			case 'priority': {
				const groups: { key: number; label: string; items: StoreLink[] }[] = [];
				for (const l of links) {
					const key = l.priority ?? 0;
					const last = groups.at(-1);
					if (last && last.key === key) last.items.push(l);
					else
						groups.push({
							key,
							label: key ? `${PRIORITY_LABEL[key as Priority]} priority` : 'No priority',
							items: [l]
						});
				}
				return groups;
			}
			case 'title':
				return links.length ? [{ key: 0, label: 'A to Z', items: links }] : [];
			default:
				return byDay(links, (l) => l.createdAt);
		}
	});
	const timeField = $derived(filters.sort === 'edited' ? 'updatedAt' : 'createdAt');
	const tagById = $derived(new Map($store.tags.map((t) => [t.id, t])));
	const projectById = $derived(new Map($store.projects.map((p) => [p.id, p])));
	const sourceById = $derived(new Map($store.sources.map((s) => [s.id, s])));

	// A new view closes what was open; a new search or filter keeps it open (the held link stays on screen).
	$effect(() => {
		void view;
		untrack(() => {
			openId = null;
			endSelect();
		});
	});
	$effect(() => {
		const v = view;
		const f = filters;
		untrack(() => selected.clear());
		store.search(f, v).catch(showError);
	});

	// A real navigation (a link, back and forward, the palette) brings its own address: read the filters from it.
	afterNavigate((nav) => {
		if (nav.type === 'enter' || (nav as { shallow?: boolean }).shallow) return;
		const next = parseFilters(nav.to?.url.searchParams ?? new URLSearchParams());
		clearTimeout(typingTimer);
		typed = next.q;
		if (!sameFilters(next, filters)) filters = next;
		panelOpen = false;
	});

	/** Shows other filters now: the list asks for them, and the address follows without a page load. */
	function apply(next: Filters) {
		clearTimeout(typingTimer);
		if (sameFilters(next, filters)) return;
		filters = next;
		const query = filterQuery(next);
		// the page's own path (already resolved), with the filters' query
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${page.url.pathname}${query ? `?${query}` : ''}`, { shallow: true, replace: true }).catch(
			() => {}
		);
	}

	/** Each keystroke in the search box: the list follows 100 ms after the last one. */
	function onsearchinput() {
		clearTimeout(typingTimer);
		typingTimer = setTimeout(() => apply({ ...filters, q: typed }), DEBOUNCE_MS);
	}
	function onsearchsubmit(event: SubmitEvent) {
		event.preventDefault();
		apply({ ...filters, q: typed });
	}
	function onsearchkey(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		// Esc clears the search, then leaves the box
		event.preventDefault();
		if (typed) {
			typed = '';
			apply({ ...filters, q: '' });
		} else searchBox?.blur();
	}

	// ---------- paging: the next 50 as the end of the list comes into sight ----------
	function more() {
		store.more().catch(showError);
	}
	function nearEnd(node: HTMLElement) {
		const seen = new IntersectionObserver(
			(entries) => entries.some((e) => e.isIntersecting) && more(),
			{ rootMargin: '600px 0px' }
		);
		seen.observe(node);
		return { destroy: () => seen.disconnect() };
	}

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
		// The command palette's "Add a link": a link to save, or the paste box to type one in.
		const onadd = (event: Event) => {
			const url = (event as CustomEvent<{ url?: string }>).detail?.url;
			if (url && canPaste) save(url);
			else box?.focus();
		};
		window.addEventListener('linksink:add', onadd);
		return () => {
			stop();
			window.removeEventListener('linksink:add', onadd);
		};
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
			const result = await store.put({
				url: link,
				title: typed || null,
				via: 'paste',
				// On a tag's or project's page the link joins it, so its row stays in the list.
				...(view.kind === 'tag' ? { tagIds: [view.id] } : {}),
				...(view.kind === 'project' ? { projectIds: [view.id] } : {})
			});
			if (narrowed && !$store.links.some((l) => l.id === result.link.id)) {
				// Saved, but the search or the filters on screen leave it out.
				notice = result.duplicate
					? 'Already saved. It does not match the search or filters on screen.'
					: 'Saved. It does not match the search or filters on screen, so it is not shown.';
			} else if (result.duplicate) {
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
		loadPicker();
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
				store.bulk({ ids, archived: !archived }).then(() => store.search(filters, view))
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
	/** On hover or focus of a row: fetch the details' and organiser's code and the picture, so they open at once. */
	function warm(link: StoreLink) {
		if (link.pending || warmed[link.id]) return;
		warmed[link.id] = true;
		loadDetail();
		loadPicker();
		if (link.imagePath) new Image().src = `/media/${link.imagePath}`;
	}

	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	let pressed = false;

	function rowClick(event: MouseEvent, link: StoreLink) {
		const target = event.target as Element;
		if (pressed) {
			// The click that ends a long-press: the press already selected the row.
			pressed = false;
			event.preventDefault();
			return;
		}
		// The checkbox and the row's buttons do their own work.
		if (target.closest('button, input')) return;
		if (selecting) {
			// While selecting, a click or tap anywhere on the row, its title too, selects it and opens nothing.
			event.preventDefault();
			if (!link.pending) toggleSelect(link.id, event.shiftKey);
			return;
		}
		// Outside Select mode the title is a plain link (a modified click opens it as the browser does).
		if (target.closest('a')) return;
		if (link.pending) return;
		if (event.shiftKey || event.metaKey || event.ctrlKey) {
			event.preventDefault();
			toggleSelect(link.id, event.shiftKey);
			return;
		}
		openId = openId === link.id ? null : link.id;
	}

	/** A shift-click range or a click while selecting must not drag a text selection across rows. */
	function rowMouseDown(event: MouseEvent) {
		if (!(event.shiftKey || selecting)) return;
		if ((event.target as Element).closest('input, button')) return;
		event.preventDefault();
	}

	function rowKey(event: KeyboardEvent, link: StoreLink) {
		if (event.target !== event.currentTarget) return;
		if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
			event.preventDefault();
			openId = link.id;
		}
	}

	/** How far a finger may drift before a press stops counting as a long-press. */
	const PRESS_SLOP = 10;
	let pressFrom = { x: 0, y: 0 };

	function pressStart(event: PointerEvent, link: StoreLink) {
		if (event.pointerType !== 'touch' || link.pending) return;
		clearTimeout(pressTimer);
		pressFrom = { x: event.clientX, y: event.clientY };
		pressTimer = setTimeout(() => {
			pressed = true;
			navigator.vibrate?.(10);
			toggleSelect(link.id);
		}, 450);
	}
	const pressEnd = () => clearTimeout(pressTimer);
	function pressMove(event: PointerEvent) {
		if (Math.hypot(event.clientX - pressFrom.x, event.clientY - pressFrom.y) > PRESS_SLOP)
			pressEnd();
	}

	// ---------- keys (plan P-T-0002, step 7): / n j k arrows Enter e t p a x; Ctrl/Cmd+K is the Shell's ----------
	/** Typing in a field, or a dialog open over the list: the list's keys stand back. */
	function keysOff(event: KeyboardEvent) {
		const target = event.target as Element | null;
		return (
			event.defaultPrevented ||
			event.metaKey ||
			event.ctrlKey ||
			event.altKey ||
			pickerIds !== null ||
			panelOpen ||
			Boolean(
				target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
			) ||
			Boolean(document.querySelector('[aria-modal="true"]'))
		);
	}
	const rowEls = () => [...document.querySelectorAll<HTMLElement>('ul.ledger li.row')];
	/** The row the keys act on: the focused one, else the open one. */
	function current(): StoreLink | null {
		const row = (document.activeElement as Element | null)?.closest<HTMLElement>('li.row');
		const id = row?.id.startsWith('link-') ? row.id.slice(5) : openId;
		return (id && links.find((l) => l.id === id)) || null;
	}
	async function move(by: 1 | -1) {
		const rows = rowEls();
		if (rows.length === 0) return;
		const at = current();
		const i = at ? rows.findIndex((r) => r.id === `link-${at.id}`) : -1;
		const next = i < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, i + by));
		if (by === 1 && i === rows.length - 1 && $store.next) {
			await store.more().catch(showError);
			await tick();
			return move(1);
		}
		const row = rows[next];
		row.focus();
		row.scrollIntoView({ block: 'nearest' });
		// With the details open, they follow the row
		const id = row.id.slice(5);
		if (openId && openId !== id && !links.find((l) => l.id === id)?.pending) openId = id;
	}
	async function edit(link: StoreLink) {
		openId = link.id;
		await loadDetail();
		// the details mount a frame or two later: wait for their title field (a second at most)
		for (let frame = 0; frame < 60; frame++) {
			await tick();
			const field = document.querySelector<HTMLTextAreaElement>(
				'textarea[aria-label="Link title"]'
			);
			if (field && openId === link.id) return field.focus();
			await new Promise((r) => requestAnimationFrame(r));
		}
	}

	function onwindowkey(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (pickerIds || panelOpen || event.defaultPrevented) return;
			if (openId) openId = null;
			else if (selecting) endSelect();
			return;
		}
		if (keysOff(event)) return;
		const link = current();
		const many = selecting && selected.size > 0 ? [...selected] : null;
		const act = (fn: () => void) => {
			event.preventDefault();
			fn();
		};
		switch (event.key) {
			case '/':
				return act(() => searchBox?.focus());
			case 'n':
				return canPaste ? act(() => box?.focus()) : undefined;
			case 'j':
				return act(() => void move(1));
			case 'k':
				return act(() => void move(-1));
			// The arrows move between rows from a row; elsewhere they scroll the page as usual
			case 'ArrowDown':
			case 'ArrowUp':
				if (!(document.activeElement as Element | null)?.closest('li.row')) return;
				return act(() => void move(event.key === 'ArrowDown' ? 1 : -1));
			case 'x':
			case 'X':
				return link && !link.pending ? act(() => toggleSelect(link.id, event.shiftKey)) : undefined;
			case 'e':
				return link && !link.pending ? act(() => void edit(link)) : undefined;
			case 't':
			case 'p': {
				const kind = event.key === 't' ? 'tag' : 'project';
				if (many) return act(() => organise(many, kind));
				return link && !link.pending ? act(() => organise([link.id], kind)) : undefined;
			}
			case 'a':
				if (many) return act(() => void bulkArchive());
				return link && !link.pending ? act(() => void archive(link)) : undefined;
		}
	}

	async function organise(ids: string[], kind?: 'tag' | 'project') {
		pickerKind = kind;
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
				<!-- On a phone the top bar names the screen; the heading stays for screen readers. -->
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
			<form class="search" role="search" onsubmit={onsearchsubmit}>
				<Icon name="search" />
				<input
					bind:this={searchBox}
					bind:value={typed}
					name="q"
					type="search"
					placeholder="Filter as you type"
					aria-label="Search"
					autocomplete="off"
					spellcheck="false"
					oninput={onsearchinput}
					onkeydown={onsearchkey}
				/>
				<!-- The / hint is a button: a click focuses the box, as the key does. -->
				<button
					class="key"
					type="button"
					tabindex="-1"
					aria-hidden="true"
					title="Press / to search"
					onclick={() => searchBox?.focus()}>/</button
				>
			</form>
			<button
				class="btn filter-btn"
				type="button"
				aria-haspopup="dialog"
				aria-expanded={panelOpen}
				class:on={filterCount(filters) > 0 || filters.sort !== 'saved'}
				onpointerenter={loadFilters}
				onfocus={loadFilters}
				onclick={() => (panelOpen = !panelOpen)}
			>
				<Icon name="filter" /><span class="fb-word">Filters</span>{#if filterCount(filters)}<span
						class="fb-n num">{filterCount(filters)}</span
					>{/if}
			</button>
			<span class="count muted num" aria-live="polite"
				>{plural(
					$store.next && $store.total !== null
						? $store.total
						: links.filter((l) => !l.pending).length,
					'link'
				)}</span
			>
		</div>

		<!-- The filters on screen as chips, and the panel that sets them: loaded on first use (the first-load budget). -->
		{#if panelOpen || filterCount(filters) > 0 || filters.sort !== 'saved'}
			{#await loadFilters() then { default: FilterPanel }}
				<FilterPanel
					{filters}
					{view}
					open={panelOpen}
					onchange={apply}
					onclose={() => (panelOpen = false)}
				/>
			{/await}
		{/if}

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
							onpointermove={pressMove}
							onmousedown={rowMouseDown}
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
							<span class="icon-tile" aria-hidden="true">
								{#if link.faviconPath}
									<img class="icon" src="/media/{link.faviconPath}" alt="" width="16" height="16" />
								{:else}
									<span class="icon blank">{displayHost(link.url).charAt(0).toUpperCase()}</span>
								{/if}
							</span>
							<span class="c-title">
								<!-- eslint-disable svelte/no-navigation-without-resolve -- a saved link points off-site -->
								<a
									class="t"
									href={link.url}
									rel="noopener noreferrer"
									target="_blank"
									onclick={() =>
										!selecting && !link.pending && store.opened(link.id).catch(() => {})}
									>{link.title || link.url}</a
								>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
								<!-- Line two: source, projects (dot and name), tags as text. On a phone the status and priority
								     lead it, and it holds one line: items that do not fit drop whole. -->
								<span class="meta-line">
									{#if link.pending}
										<span class="m">Saving…</span>
									{:else}
										{#if link.status}<span class="m m-state"
												><StateMark kind="status" value={link.status} size={12} />{STATUS_LABEL[
													link.status as Status
												]}</span
											>{/if}
										{#if link.priority}<span class="m m-state"
												><StateMark
													kind="priority"
													value={link.priority}
													size={12}
												/>{PRIORITY_LABEL[link.priority as Priority]}</span
											>{/if}
										<span class="m m-src">{source?.name ?? displayHost(link.url)}</span>
										<span class="c-proj">
											{#each rowProjects as p (p.id)}<span class="m m-proj"
													><span class="dot" style:--c="var(--dot-{p.color})"></span>{p.name}</span
												>{/each}
										</span>
										<span class="c-tags">
											{#each rowTags as t (t.id)}<span class="m m-tag">{t.name}</span>{/each}
										</span>
									{/if}
								</span>
							</span>
							<span class="c-state">
								<span class="st st-status" class:unset={!link.status}
									><StateMark kind="status" value={link.status} />{#if link.status}{STATUS_LABEL[
											link.status as Status
										]}{:else}<span class="sr-only">No status</span>{/if}</span
								>
								<span class="st st-prio" class:unset={!link.priority}
									><StateMark
										kind="priority"
										value={link.priority}
									/>{#if link.priority}{PRIORITY_LABEL[link.priority as Priority]}{:else}<span
											class="sr-only">No priority</span
										>{/if}</span
								>
							</span>
							<time class="c-time num" datetime={new Date(link[timeField]).toISOString()}
								>{filters.sort === 'title' || filters.sort === 'priority'
									? shortDate(link.createdAt)
									: timeOf(link[timeField])}</time
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
			{#if $store.next}
				<div class="more" use:nearEnd>
					<button class="btn ghost" type="button" disabled={$store.loadingMore} onclick={more}
						>{$store.loadingMore ? 'Loading…' : 'Show more'}</button
					>
				</div>
			{/if}
		{:else if !$store.loading}
			{@const words = q
				? `Nothing matches “${q}”${filterCount(filters) ? ' with these filters' : ''}. Try fewer or shorter words.`
				: filterCount(filters)
					? 'No links match these filters. Take one off to see more.'
					: empty}
			{@const cut = words.indexOf('. ')}
			<div class="empty-card empty">
				<p class="lead">{cut > 0 ? words.slice(0, cut + 1) : words}</p>
				{#if cut > 0}<p>{words.slice(cut + 2)}</p>{/if}
			</div>
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
					onorganise={(kind) => organise([open.id], kind)}
					onarchive={() => archive(open)}
					ondelete={() => remove(open)}
				/>
			{/key}
		{/await}
	{/if}
</div>

{#if pickerIds}
	{#await loadPicker() then { default: Picker }}
		<Picker ids={pickerIds} kind={pickerKind} onclose={closePicker} />
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
	/* The search box (ADR-0005's look; it still searches on Enter until T-0009 makes it live). */
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 300px;
		height: 34px;
		padding: 0 6px 0 10px;
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
	.search input::placeholder {
		color: var(--faint);
	}
	.search input::-webkit-search-cancel-button {
		display: none;
	}
	.key {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--muted);
		font: inherit;
		font-size: 11px;
		line-height: 1;
	}
	.search:focus-within .key {
		visibility: hidden;
	}
	.count {
		margin-left: auto;
		font-size: 13px;
	}
	button.key {
		cursor: text;
	}
	.filter-btn {
		height: 34px;
		padding: 0 10px;
		color: var(--muted);
		font-weight: 450;
	}
	.filter-btn:hover,
	.filter-btn[aria-expanded='true'],
	.filter-btn.on {
		color: var(--text);
	}
	.filter-btn[aria-expanded='true'] {
		border-color: var(--text);
	}
	.fb-n {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 9px;
		background: var(--text);
		color: var(--ground);
		font-size: 11px;
		font-weight: 600;
	}
	.more {
		display: flex;
		justify-content: center;
		padding-top: 16px;
	}

	/* ---------- the ledger: day names on the ground, each day's rows one card ---------- */
	.ledger {
		list-style: none;
		margin: 20px 0 0;
		padding: 0;
		--act-width: 80px;
		--state-width: 124px;
	}
	.day-h {
		margin-top: 24px;
		padding: 0 2px 8px;
	}
	.day-h:first-child {
		margin-top: 0;
	}
	.day-h h2 {
		margin: 0;
		font-size: 13px;
		line-height: 18px;
		font-weight: 500;
		color: var(--muted);
	}
	.day-h .n {
		margin-left: 6px;
		font-weight: 400;
		color: var(--faint);
	}
	.selecting .row {
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}
	/* Row r3 (ADR-0005): favicon, the title over its second line, a fixed state cell, the time, then the actions'
	   own slot, so a click on the time never lands on a button. */
	.row {
		position: relative;
		isolation: isolate;
		display: grid;
		grid-template-columns: 20px minmax(0, 1fr) var(--state-width) 44px var(--act-width);
		align-items: start;
		column-gap: 12px;
		min-height: 56px;
		padding: 8px 14px;
		background: var(--surface);
		cursor: pointer;
		outline-offset: -2px;
	}
	.selecting .row {
		grid-template-columns: 16px 20px minmax(0, 1fr) var(--state-width) 44px var(--act-width);
	}
	.day-h + .row {
		padding-top: 12px;
		border-radius: var(--radius-card) var(--radius-card) 0 0;
	}
	.row.last {
		padding-bottom: 12px;
		border-radius: 0 0 var(--radius-card) var(--radius-card);
	}
	.day-h + .row.last {
		border-radius: var(--radius-card);
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
	/* hover, open and selected: an inset tint inside the day's card */
	.row::after {
		content: '';
		position: absolute;
		z-index: -1;
		inset: 0 4px;
		border-radius: 4px;
		background: transparent;
		transition: background-color var(--t-hover) var(--ease-out);
	}
	.day-h + .row::after {
		top: 4px;
	}
	.row.last::after {
		bottom: 4px;
	}
	.row:focus-visible::after {
		background: var(--raised);
	}
	@media (hover: hover) {
		.row:hover::after {
			background: var(--raised);
		}
	}
	.row.open::after,
	.row.selected::after {
		background: var(--active);
	}
	/* a selected row also carries a 2 px accent bar inside its left edge; the open row has the fill alone */
	.row.selected {
		box-shadow: inset 2px 0 0 var(--accent);
	}
	.row.open::before,
	.row.open + .row::before,
	.row.selected::before,
	.row.selected + .row::before {
		opacity: 0;
	}
	.chk {
		width: 16px;
		height: 16px;
		margin: 2px 0 0;
		accent-color: var(--text);
	}
	/* the favicon sits on a tile: invisible in light, pale in dark so a black icon reads */
	.icon-tile {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 4px;
		background: var(--icon-tile);
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
		display: flex;
		flex-direction: column;
	}
	/* Only the title's text opens the site; the rest of the row opens the details. */
	.t {
		display: inline-block;
		max-width: 100%;
		align-self: flex-start;
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
	/* line two: plain text in --meta; on a wide screen it ends in an ellipsis */
	.meta-line {
		display: block;
		margin-top: 2px;
		font-size: 13px;
		line-height: 18px;
		color: var(--meta);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.meta-line .m {
		margin-right: 12px;
	}
	.meta-line .m-tag {
		margin-right: 0;
	}
	.meta-line .m-tag:not(:last-child)::after {
		content: ', ';
	}
	.meta-line .m-state {
		display: none;
	}
	.meta-line .dot {
		width: 7px;
		height: 7px;
		margin: 0 5px 1px 0;
		vertical-align: middle;
	}
	.c-proj,
	.c-tags {
		display: contents;
	}
	/* the fixed state cell: status over priority, each a mark and a word, from one left edge */
	.c-state {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.st {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 18px;
		font-size: 13px;
		white-space: nowrap;
		color: var(--text);
	}
	.st-status {
		margin-top: 1px;
	}
	.st-prio {
		margin-top: 2px;
		color: var(--muted);
	}
	.c-time {
		text-align: right;
		font-size: 13px;
		line-height: 20px;
		color: var(--muted);
	}
	.c-act {
		display: flex;
		justify-content: flex-end;
		gap: 0;
		margin-top: -4px;
		opacity: 0;
		transition: opacity var(--t-hover) var(--ease-out);
	}
	.row:focus-within .c-act,
	.row.open .c-act {
		opacity: 1;
	}
	@media (hover: hover) {
		.row:hover .c-act {
			opacity: 1;
		}
	}
	.selecting .c-act {
		display: none;
	}
	.c-act .icon-btn {
		width: 26px;
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
		padding: 32px 24px;
	}
	.empty p {
		margin: 0;
		max-width: 52ch;
	}
	.empty .lead {
		color: var(--text);
		font-weight: 500;
	}
	.empty .lead + p {
		margin-top: 4px;
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
	/* The phone row: favicon, the title on up to two lines, the time at the right; line two leads with the status
	   and priority and holds one line, where whole items drop when they do not fit (a wrapping line clipped to one
	   line's height), so nothing is cut mid-word. */
	@media (max-width: 759px) {
		.page {
			--pad: 16px;
			padding: 0 16px calc(96px + env(safe-area-inset-bottom));
		}
		.title-row {
			padding-top: 4px;
			align-items: center;
		}
		h1 {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
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
			height: 38px;
		}
		.row,
		.selecting .row {
			grid-template-columns: 20px minmax(0, 1fr) auto;
			column-gap: 10px;
			padding: 10px 14px;
		}
		.day-h + .row {
			padding-top: 14px;
		}
		.row.last {
			padding-bottom: 14px;
		}
		.selecting .row {
			grid-template-columns: 16px 20px minmax(0, 1fr) auto;
		}
		.t {
			white-space: normal;
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
		}
		.meta-line {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			column-gap: 12px;
			margin-top: 4px;
			height: 18px;
			overflow: hidden;
			white-space: nowrap;
		}
		.meta-line .m,
		.meta-line .m-tag {
			margin: 0;
			display: inline-flex;
			align-items: center;
			gap: 5px;
			max-width: 100%;
			height: 18px;
		}
		.meta-line .m-tag:not(:last-child)::after {
			content: none;
		}
		.meta-line .m-state {
			display: inline-flex;
			color: var(--text);
		}
		.meta-line .dot {
			margin: 0;
		}
		.c-state,
		.c-act {
			display: none;
		}
		.toolbar .count {
			display: none;
		}
	}
</style>
