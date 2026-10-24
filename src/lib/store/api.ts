// The store's first implementation: an in-memory list of the current view, kept by the JSON API (/api/links).
import { ulid } from '../ulid.ts';
import { displayHost, parseHttpUrl } from '../url.ts';
import {
	StoreError,
	type LinkChanges,
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
		pending: true
	};
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
	let state: StoreState = { links: [], loading: true };
	const subscribers = new Set<(state: StoreState) => void>();
	let listCall = 0;

	function set(links: StoreLink[], loading = state.loading) {
		state = { links, loading };
		for (const run of subscribers) run(state);
	}
	const confirmed = (link: LinkJson): StoreLink => ({ ...link, pending: false });
	const without = (id: string) => state.links.filter((l) => l.id !== id);
	const withLink = (link: LinkJson) => [...without(link.id), confirmed(link)].sort(newestFirst);

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
		const { body } = await request<{ link: LinkJson }>(`/api/links/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			body: JSON.stringify(fields)
		});
		set(withLink(body.link));
		return { link: body.link, duplicate: false };
	}

	return {
		async list(q) {
			const call = ++listCall;
			const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
			const { body } = await request<{ links: LinkJson[] }>(`/api/links${query}`);
			// A newer list was asked for meanwhile: this answer is stale.
			if (call !== listCall) return body.links;
			// Rows still being saved stay on screen.
			const pending = state.links.filter(
				(l) => l.pending && !body.links.some((b) => b.id === l.id)
			);
			set([...pending, ...body.links.map(confirmed)], false);
			return body.links;
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
