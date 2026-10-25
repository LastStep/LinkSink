import { describe, expect, it } from 'vitest';
import { NO_FILTERS, type Filters } from '../search/filters.ts';
import { createApiStore } from './api.ts';
import type { LinkJson, StoreState } from './types.ts';

const link = (id: string, over: Partial<LinkJson> = {}): LinkJson => ({
	id,
	url: `https://${id}.example/`,
	urlKey: `${id}.example/`,
	title: `Link ${id}`,
	description: null,
	notes: null,
	sourceId: null,
	media: 'page',
	status: null,
	priority: null,
	archivedAt: null,
	siteName: null,
	author: null,
	publishedAt: null,
	durationS: null,
	faviconPath: null,
	imagePath: null,
	metaState: 'done',
	metaFetchedAt: null,
	userSet: [],
	savedVia: 'paste',
	createdAt: 100,
	updatedAt: 100,
	openedAt: null,
	tagsText: '',
	projectsText: '',
	version: 1,
	deletedAt: null,
	tagIds: [],
	projectIds: [],
	...over
});

const f = (over: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...over });

/** A fake API: GET /api/links answers from `pages` by its `after`; PATCH answers with the link changed. */
function fakeApi(
	pages: Record<string, { links: LinkJson[]; next: string | null; total?: number }>
) {
	const calls: string[] = [];
	const held = new Map<string, LinkJson>();
	for (const page of Object.values(pages)) for (const l of page.links) held.set(l.id, l);
	let gate: Promise<void> | null = null;
	const fetcher = (async (path: string, init?: RequestInit) => {
		calls.push(`${init?.method ?? 'GET'} ${path}`);
		if (init?.method === 'PATCH') {
			const id = decodeURIComponent(path.split('/').pop()!);
			const changed = { ...held.get(id)!, ...JSON.parse(String(init.body)) };
			held.set(id, changed);
			return Response.json({ link: changed });
		}
		if (path.startsWith('/api/organise')) return Response.json({});
		if (gate) await gate;
		const after = new URL(path, 'http://x').searchParams.get('after') ?? '';
		return Response.json({ ...(pages[after] ?? { links: [], next: null }), counts: undefined });
	}) as typeof fetch;
	return { fetcher, calls, hold: (p: Promise<void>) => (gate = p) };
}

const snapshot = (store: ReturnType<typeof createApiStore>) => {
	let s!: StoreState;
	store.subscribe((x) => (s = x))();
	return s;
};

describe('the store: search, filters and pages', () => {
	it('asks for the view with its filters in the address form, and keeps the next cursor', async () => {
		const api = fakeApi({ '': { links: [link('a')], next: 'c1', total: 51 } });
		const store = createApiStore(api.fetcher);
		await store.search(f({ q: 'deep learning', status: ['done', 'none'], sort: 'title' }), {
			kind: 'tag',
			id: 'T1'
		});
		expect(api.calls).toEqual([
			'GET /api/links?tag=T1&q=deep%20learning&status=done,none&sort=title'
		]);
		const s = snapshot(store);
		expect(s.next).toBe('c1');
		expect(s.total).toBe(51);
		expect(s.filters.q).toBe('deep learning');
	});

	it('loads the next page after the last, once, and stops at the end', async () => {
		const api = fakeApi({
			'': { links: [link('a', { createdAt: 3 }), link('b', { createdAt: 2 })], next: 'c1' },
			c1: { links: [link('b', { createdAt: 2 }), link('c', { createdAt: 1 })], next: null }
		});
		const store = createApiStore(api.fetcher);
		await store.search(f({ q: 'link' }));
		const [added] = await Promise.all([store.more(), store.more()]);
		expect(added.map((l) => l.id)).toEqual(['c']);
		expect(snapshot(store).links.map((l) => l.id)).toEqual(['a', 'b', 'c']);
		expect(api.calls.filter((c) => c.includes('after='))).toEqual([
			'GET /api/links?q=link&after=c1'
		]);
		expect(await store.more()).toEqual([]);
	});

	it('drops an older answer that arrives after a newer search', async () => {
		let release!: () => void;
		const api = fakeApi({ '': { links: [link('a')], next: null } });
		const store = createApiStore(api.fetcher);
		api.hold(new Promise<void>((r) => (release = r)));
		const old = store.search(f({ q: 'li' }));
		const fresh = store.search(f({ q: 'link' }));
		release();
		await Promise.all([old, fresh]);
		expect(snapshot(store).filters.q).toBe('link');
	});

	it('takes a link out of a filtered list once a change stops it matching, unless it is open', async () => {
		const api = fakeApi({
			'': {
				links: [link('a', { status: 'to_read' }), link('b', { status: 'to_read' })],
				next: null
			}
		});
		const store = createApiStore(api.fetcher);
		await store.search(f({ status: ['to_read'] }));
		await store.put({ id: 'a', status: 'done' });
		expect(snapshot(store).links.map((l) => l.id)).toEqual(['b']);
		// the open one (held) stays while it is open, and goes when it is let go
		store.hold(['b']);
		await store.put({ id: 'b', status: 'done' });
		expect(snapshot(store).links.map((l) => l.id)).toEqual(['b']);
		store.hold([]);
		expect(snapshot(store).links).toEqual([]);
	});

	it('takes a link out of a search once an edit stops it matching', async () => {
		const api = fakeApi({ '': { links: [link('a', { title: 'Zebra notes' })], next: null } });
		const store = createApiStore(api.fetcher);
		await store.search(f({ q: 'zeb' }));
		await store.put({ id: 'a', title: 'Zebra stripes' });
		expect(snapshot(store).links).toHaveLength(1);
		await store.put({ id: 'a', title: 'Lion mane' });
		expect(snapshot(store).links).toHaveLength(0);
	});

	it('keeps the sort when a link changes', async () => {
		const api = fakeApi({
			'': {
				links: [link('a', { title: 'Apple' }), link('b', { title: 'Banana' })],
				next: null
			}
		});
		const store = createApiStore(api.fetcher);
		await store.search(f({ sort: 'title' }));
		await store.put({ id: 'a', title: 'Cherry' });
		expect(snapshot(store).links.map((l) => l.title)).toEqual(['Banana', 'Cherry']);
	});
});
