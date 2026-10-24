// The store's first implementation: an in-memory list of the current view, kept by the JSON API (/api/links).
import { ulid } from '../ulid.ts';
import { displayHost, parseHttpUrl } from '../url.ts';
import {
	StoreError,
	type BulkInput,
	type LinkChanges,
	type ProjectJson,
	type SourceJson,
	type TagJson,
	type View,
	type ViewCounts,
	type LinkJson,
	type LinkStore,
	type NewLinkInput,
	type PutResult,
	type StoreLink,
	type StoreState
} from './types.ts';

const newestFirst = (a: LinkJson, b: LinkJson) =>
	b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

function optimistic(id: string, input: NewLinkInput): StoreLink {
	const now = Date.now();
	return {
		id,
		url: input.url,
		urlKey: '',
		title: input.title?.trim() || displayHost(input.url),
		description: null,
		notes: null,
		sourceId: null,
		media: null,
		status: null,
		priority: null,
		archivedAt: null,
		siteName: null,
		author: null,
		publishedAt: null,
		durationS: null,
		faviconPath: null,
		imagePath: null,
		metaState: 'pending',
		metaFetchedAt: null,
		userSet: input.title?.trim() ? ['title'] : [],
		savedVia: input.via ?? 'paste',
		createdAt: now,
		updatedAt: now,
		openedAt: null,
		tagsText: '',
		projectsText: '',
		version: 0,
		deletedAt: null,
		tagIds: [],
		projectIds: [],
		pending: true
	};
}

/** Whether a link belongs in a view, on what the store can see: Archive holds archived links, the rest the others. */
function belongs(view: View, link: LinkJson) {
	if (link.deletedAt !== null) return false;
	if ((view.kind === 'archive') !== (link.archivedAt !== null)) return false;
	return true;
}

/** Query string for a view. */
export function viewQuery(view: View): string {
	switch (view.kind) {
		case 'unsorted':
		case 'archive':
			return `view=${view.kind}`;
		case 'project':
			return `project=${encodeURIComponent(view.id)}`;
		case 'tag':
			return `tag=${encodeURIComponent(view.id)}`;
		default:
			return '';
	}
}

export interface ApiStoreOptions {
	/** How often a new link's details are asked for while the server fetches them (1 s). */
	pollEveryMs?: number;
	/** How long to keep asking before the row stays as it is (10 s). */
	pollForMs?: number;
}

export function createApiStore(
	fetcher: typeof fetch = (...args) => fetch(...args),
	{ pollEveryMs = 1_000, pollForMs = 10_000 }: ApiStoreOptions = {}
): LinkStore {
	let state: StoreState = {
		links: [],
		loading: true,
		view: { kind: 'all' },
		tags: [],
		projects: [],
		sources: [],
		counts: { links: 0, unsorted: 0, archive: 0 },
		organised: false
	};
	const subscribers = new Set<(state: StoreState) => void>();
	let listCall = 0;

	function emit(next: Partial<StoreState>) {
		state = { ...state, ...next };
		for (const run of subscribers) run(state);
	}
	function set(links: StoreLink[], loading = state.loading) {
		emit({ links, loading });
	}
	const confirmed = (link: LinkJson): StoreLink => ({ ...link, pending: false });
	const without = (id: string) => state.links.filter((l) => l.id !== id);
	/** The list with `link` put in (or taken out, when it no longer belongs in the view). */
	const withLink = (link: LinkJson) =>
		belongs(state.view, link)
			? [...without(link.id), confirmed(link)].sort(newestFirst)
			: without(link.id);

	async function request<T>(
		path: string,
		init?: RequestInit
	): Promise<{ status: number; body: T }> {
		let res: Response;
		try {
			res = await fetcher(path, {
				...init,
				// On every write, body or not: SvelteKit's CSRF rule treats a body-less write as a form post.
				headers: init?.method ? { 'content-type': 'application/json' } : undefined
			});
		} catch {
			throw new StoreError('Could not reach LinkSink. Check the connection and try again.', 0);
		}
		const body = (await res.json().catch(() => ({}))) as T & { error?: string };
		if (!res.ok) throw new StoreError(body.error ?? 'Something went wrong. Try again.', res.status);
		return { status: res.status, body };
	}

	async function create(input: NewLinkInput): Promise<PutResult> {
		if (!parseHttpUrl(input.url)) throw new StoreError('That is not an http or https link.', 400);
		const id = ulid();
		// The row shows now, before the server answers.
		set([optimistic(id, input), ...state.links]);
		try {
			const { body } = await request<PutResult>('/api/links', {
				method: 'POST',
				body: JSON.stringify({ id, url: input.url, title: input.title ?? null, via: input.via })
			});
			// The optimistic row becomes the server's (the same id), or gives way to the existing link.
			state = { ...state, links: without(id) };
			set(withLink(body.link));
			if (!body.duplicate) {
				const c = state.counts;
				emit({ counts: { ...c, links: c.links + 1, unsorted: c.unsorted + 1 } });
			}
			if (!body.duplicate && body.link.metaState === 'pending') watchDetails(body.link.id);
			return body;
		} catch (error) {
			set(without(id));
			throw error;
		}
	}

	async function getLink(id: string): Promise<LinkJson | null> {
		try {
			const { body } = await request<{ link: LinkJson }>(`/api/links/${encodeURIComponent(id)}`);
			return body.link;
		} catch (error) {
			if (error instanceof StoreError && error.status === 404) return null;
			throw error;
		}
	}

	/**
	 * After a save, the server fetches the page's details in the background: ask for the link every second, up to
	 * 10 s or until `meta_state` is no longer pending, and put each answer in the row (title, icon, preview).
	 */
	function watchDetails(id: string) {
		let waited = 0;
		const tick = async () => {
			waited += pollEveryMs;
			let link: LinkJson | null | undefined;
			try {
				link = await getLink(id);
			} catch {
				// a missed poll (offline, a server error): try again on the next tick
			}
			if (link === null) return; // deleted meanwhile
			// Only a row still on screen is updated (not one deleted here, or out of this view).
			if (link && state.links.some((l) => l.id === id && !l.pending)) set(withLink(link));
			if (link && link.metaState !== 'pending') return;
			if (waited < pollForMs) setTimeout(tick, pollEveryMs);
		};
		setTimeout(tick, pollEveryMs);
	}

	async function change({ id, ...fields }: LinkChanges): Promise<PutResult> {
		const before = state.links.find((l) => l.id === id);
		if (before) {
			// The row changes now; the server's answer replaces it, or the old row comes back on a failure.
			const { archived, ...rest } = fields;
			const guess: StoreLink = { ...before, ...rest, pending: before.pending };
			if (archived !== undefined) guess.archivedAt = archived ? Date.now() : null;
			set(withLink(guess));
		}
		try {
			const { body } = await request<{ link: LinkJson }>(`/api/links/${encodeURIComponent(id)}`, {
				method: 'PATCH',
				body: JSON.stringify(fields)
			});
			set(withLink(body.link));
			if (fields.archived !== undefined || fields.tagIds || fields.projectIds) scheduleRefresh();
			return { link: body.link, duplicate: false };
		} catch (error) {
			if (before) set(withLink(before));
			throw error;
		}
	}

	let refreshTimer: ReturnType<typeof setTimeout> | undefined;
	/** Counts follow a change a moment later (one request for a burst of picker toggles). */
	function scheduleRefresh() {
		clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => void refresh().catch(() => {}), 150);
	}

	async function refresh() {
		const { body } = await request<{
			tags: TagJson[];
			projects: ProjectJson[];
			sources: SourceJson[];
			counts: ViewCounts;
		}>('/api/organise');
		emit({ ...body, organised: true });
	}

	const path = (kind: string, id: string, rest = '') =>
		`/api/${kind}/${encodeURIComponent(id)}${rest}`;
	const send = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

	return {
		async list(q, view = { kind: 'all' }) {
			const call = ++listCall;
			const params = [q?.trim() ? `q=${encodeURIComponent(q.trim())}` : '', viewQuery(view)]
				.filter(Boolean)
				.join('&');
			const { body } = await request<{ links: LinkJson[]; counts?: ViewCounts }>(
				`/api/links${params ? `?${params}` : ''}`
			);
			// A newer list was asked for meanwhile: this answer is stale.
			if (call !== listCall) return body.links;
			const sameView = JSON.stringify(view) === JSON.stringify(state.view);
			// Rows still being saved stay on screen (in the view they were saved in).
			const pending = sameView
				? state.links.filter((l) => l.pending && !body.links.some((b) => b.id === l.id))
				: [];
			emit({
				view,
				links: [...pending, ...body.links.map(confirmed)],
				loading: false,
				...(body.counts ? { counts: body.counts } : {})
			});
			return body.links;
		},

		refresh,

		async bulk(input: BulkInput) {
			const { body } = await request<{ ids: string[]; links: LinkJson[] }>(
				'/api/links/bulk',
				send('POST', input)
			);
			let next = state.links;
			if (input.deleted) next = next.filter((l) => !input.ids.includes(l.id));
			for (const link of body.links) {
				next = next.filter((l) => l.id !== link.id);
				if (belongs(state.view, link)) next = [...next, confirmed(link)];
			}
			set(next.sort(newestFirst));
			scheduleRefresh();
			return body.links;
		},

		async opened(id) {
			const { body } = await request<{ openedAt: number }>(
				path('links', id, '/opened'),
				send('POST', {})
			);
			const link = state.links.find((l) => l.id === id);
			if (link) set(withLink({ ...link, openedAt: body.openedAt }));
		},

		async createTag(name) {
			const { body } = await request<{ tag: TagJson }>('/api/tags', send('POST', { name }));
			if (!state.tags.some((t) => t.id === body.tag.id)) {
				emit({ tags: [...state.tags, body.tag].sort((a, b) => a.name.localeCompare(b.name)) });
			}
			return body.tag;
		},

		async updateTag(id, changes) {
			const { body } = await request<{ tag: TagJson }>(path('tags', id), send('PATCH', changes));
			emit({ tags: state.tags.map((t) => (t.id === id ? body.tag : t)) });
			return body.tag;
		},

		async deleteTag(id) {
			await request(path('tags', id), { method: 'DELETE' });
			emit({
				tags: state.tags.filter((t) => t.id !== id),
				links: state.links.map((l) =>
					l.tagIds.includes(id) ? { ...l, tagIds: l.tagIds.filter((t) => t !== id) } : l
				)
			});
			scheduleRefresh();
		},

		async mergeTag(id, into) {
			await request(path('tags', id, '/merge'), send('POST', { into }));
			emit({
				tags: state.tags.filter((t) => t.id !== id),
				links: state.links.map((l) =>
					l.tagIds.includes(id)
						? {
								...l,
								tagIds: [...new Set(l.tagIds.map((t) => (t === id ? into : t)))]
							}
						: l
				)
			});
			scheduleRefresh();
		},

		async createProject(input) {
			const { body } = await request<{ project: ProjectJson }>(
				'/api/projects',
				send('POST', input)
			);
			emit({ projects: [...state.projects, body.project] });
			return body.project;
		},

		async updateProject(id, changes) {
			const { body } = await request<{ project: ProjectJson }>(
				path('projects', id),
				send('PATCH', changes)
			);
			emit({ projects: state.projects.map((p) => (p.id === id ? body.project : p)) });
			return body.project;
		},

		async deleteProject(id) {
			await request(path('projects', id), { method: 'DELETE' });
			emit({
				projects: state.projects.filter((p) => p.id !== id),
				links: state.links.map((l) =>
					l.projectIds.includes(id) ? { ...l, projectIds: l.projectIds.filter((p) => p !== id) } : l
				)
			});
			scheduleRefresh();
		},

		async reorderProjects(ids) {
			const before = state.projects;
			const byId = new Map(before.map((p) => [p.id, p]));
			emit({
				projects: ids.map((id, position) => ({ ...byId.get(id)!, position })).filter((p) => p.id)
			});
			try {
				const { body } = await request<{ projects: ProjectJson[] }>(
					'/api/projects/order',
					send('PUT', { ids })
				);
				emit({ projects: body.projects });
			} catch (error) {
				emit({ projects: before });
				throw error;
			}
		},

		async renameSource(id, name) {
			const { body } = await request<{ source: SourceJson }>(
				path('sources', id),
				send('PATCH', { name })
			);
			emit({
				sources: state.sources
					.map((s) => (s.id === id ? body.source : s))
					.sort((a, b) => a.name.localeCompare(b.name))
			});
			return body.source;
		},

		get: getLink,

		put(input) {
			return 'id' in input && input.id ? change(input) : create(input as NewLinkInput);
		},

		async remove(id) {
			const link = state.links.find((l) => l.id === id);
			set(without(id));
			try {
				await request(`/api/links/${encodeURIComponent(id)}`, { method: 'DELETE' });
			} catch (error) {
				// Not deleted after all: the row comes back.
				if (link) set(withLink(link));
				throw error;
			}
		},

		async restore(id) {
			const { body } = await request<{ link: LinkJson }>(
				`/api/links/${encodeURIComponent(id)}/restore`,
				{ method: 'POST' }
			);
			set(withLink(body.link));
			return body.link;
		},

		subscribe(run) {
			subscribers.add(run);
			run(state);
			return () => void subscribers.delete(run);
		}
	};
}
