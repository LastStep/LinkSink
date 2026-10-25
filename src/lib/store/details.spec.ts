import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiStore } from './api.ts';
import { createDetailsWatch } from './details.ts';
import type { LinkJson, StoreState } from './types.ts';

const link = (id: string, metaState = 'pending', extra: Partial<LinkJson> = {}): LinkJson => ({
	id,
	url: `https://site.example/${id}`,
	urlKey: `site.example/${id}`,
	title: 'site.example',
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
	metaState,
	metaFetchedAt: null,
	userSet: [],
	savedVia: 'import',
	createdAt: 1_000,
	updatedAt: 1_000,
	openedAt: null,
	tagsText: '',
	projectsText: '',
	version: 1,
	deletedAt: null,
	tagIds: [],
	projectIds: [],
	...extra
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the details watch (T-0023)', () => {
	it('counts the waiting links, asks again while any waits, then stops', async () => {
		const rounds = [
			[link('a'), link('b'), link('c', 'ok')],
			[link('a', 'ok'), link('b')],
			[link('b', 'ok')]
		];
		let at = 0;
		const left: number[] = [];
		const watch = createDetailsWatch({
			page: async () => ({ links: rounds[Math.min(at++, rounds.length - 1)], next: null }),
			onLinks: () => {},
			onLeft: (n) => left.push(n),
			hidden: () => false
		});
		watch.check();
		await vi.advanceTimersByTimeAsync(0);
		expect(left).toEqual([2]);
		await vi.advanceTimersByTimeAsync(3_000);
		expect(left).toEqual([2, 1]);
		await vi.advanceTimersByTimeAsync(3_000);
		expect(left).toEqual([2, 1, 0]);
		const asked = at;
		await vi.advanceTimersByTimeAsync(60_000);
		expect(at).toBe(asked); // nothing waits: no more asking
	});

	it('looks once when nothing waits, and does not keep looking', async () => {
		const page = vi.fn(async () => ({ links: [link('a', 'ok'), link('b', 'failed')], next: null }));
		const watch = createDetailsWatch({ page, onLinks: () => {}, onLeft: () => {} });
		watch.check();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(page).toHaveBeenCalledTimes(1);
	});

	it('asks no faster than once every 10 s in a hidden tab', async () => {
		const page = vi.fn(async () => ({ links: [link('a')], next: null }));
		const watch = createDetailsWatch({
			page,
			onLinks: () => {},
			onLeft: () => {},
			hidden: () => true
		});
		watch.check();
		await vi.advanceTimersByTimeAsync(0);
		expect(page).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(9_900);
		expect(page).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(200);
		expect(page).toHaveBeenCalledTimes(2);
		watch.stop();
	});

	it('is one watch however often it is checked', async () => {
		const page = vi.fn(async () => ({ links: [link('a')], next: null }));
		const watch = createDetailsWatch({
			page,
			onLinks: () => {},
			onLeft: () => {},
			hidden: () => false
		});
		watch.check();
		watch.check();
		watch.check();
		await vi.advanceTimersByTimeAsync(0);
		expect(page).toHaveBeenCalledTimes(1);
		watch.stop();
	});

	it('reads page after page up to its cap, and says "at least" when it stops early', async () => {
		const page = vi.fn(async (after: string | null) => ({
			links: [link(`l${after ?? 0}`)],
			next: `c${Number(after?.slice(1) ?? 0) + 1}`
		}));
		const left: [number, boolean][] = [];
		const watch = createDetailsWatch({
			page,
			onLinks: () => {},
			onLeft: (n, atLeast) => left.push([n, atLeast]),
			maxPages: 3
		});
		watch.check();
		await vi.advanceTimersByTimeAsync(0);
		expect(page).toHaveBeenCalledTimes(3);
		expect(left).toEqual([[3, true]]);
		watch.stop();
	});

	it('keeps asking after a missed scan while details were awaited, and stops if the first look fails', async () => {
		let n = 0;
		const page = vi.fn(async () => {
			if (n++ === 1) throw new Error('offline');
			return { links: [link('a', n > 2 ? 'ok' : 'pending')], next: null };
		});
		const watch = createDetailsWatch({
			page,
			onLinks: () => {},
			onLeft: () => {},
			hidden: () => false
		});
		watch.check();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(page).toHaveBeenCalledTimes(3);
		const failing = vi.fn(async () => {
			throw new Error('down');
		});
		createDetailsWatch({ page: failing, onLinks: () => {}, onLeft: () => {} }).check();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(failing).toHaveBeenCalledTimes(1);
	});
});

describe('the store with the library watch on (T-0023)', () => {
	it('fills in a row that is on screen, with no reload, and shows how many are left', async () => {
		let library = [link('a'), link('b')];
		const fetcher = (async (path: string) => {
			if (path.startsWith('/api/links?limit=200'))
				return Response.json({ links: library, next: null });
			if (path.startsWith('/api/links'))
				return Response.json({ links: library, next: null, total: library.length });
			return Response.json({});
		}) as typeof fetch;
		const store = createApiStore(fetcher, { watchLibrary: { hidden: () => false } });
		const seen: StoreState[] = [];
		store.subscribe((s) => seen.push(s));
		await store.search({ ...seen[0].filters }, { kind: 'all' });
		await vi.advanceTimersByTimeAsync(0);
		const now = () => seen.at(-1)!;
		expect(now().detailsLeft).toBe(2);
		library = [link('a', 'ok', { title: 'A page', version: 2 }), link('b')];
		await vi.advanceTimersByTimeAsync(3_000);
		expect(now().detailsLeft).toBe(1);
		expect(now().links.find((l) => l.id === 'a')).toMatchObject({
			title: 'A page',
			metaState: 'ok'
		});
		library = [library[0], link('b', 'failed', { version: 2 })];
		await vi.advanceTimersByTimeAsync(3_000);
		expect(now().detailsLeft).toBe(0);
		expect(now().links.find((l) => l.id === 'b')?.metaState).toBe('failed');
	});
});
