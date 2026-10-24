import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiStore } from './api.ts';
import type { LinkJson, StoreState } from './types.ts';

const base: LinkJson = {
	id: '',
	url: 'https://blog.example/post',
	urlKey: 'blog.example/post',
	title: 'blog.example',
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
	userSet: [],
	savedVia: 'paste',
	createdAt: 1,
	updatedAt: 1,
	openedAt: null,
	tagsText: '',
	projectsText: '',
	version: 1,
	deletedAt: null
};

/** A fake API: POST answers with the posted id; each GET answers with the next of `answers` (the last repeats). */
function fakeApi(answers: Partial<LinkJson>[], { duplicate = false } = {}) {
	const gets: string[] = [];
	let id = '';
	const fetcher = (async (path: string, init?: RequestInit) => {
		if (init?.method === 'POST') {
			id = JSON.parse(String(init.body)).id;
			return Response.json({ link: { ...base, id }, duplicate }, { status: duplicate ? 200 : 201 });
		}
		gets.push(path);
		const answer = answers[Math.min(gets.length - 1, answers.length - 1)];
		if (answer === null) return Response.json({ error: 'No such link.' }, { status: 404 });
		return Response.json({ link: { ...base, id, ...answer } });
	}) as typeof fetch;
	return { fetcher, gets };
}

let states: StoreState[];
beforeEach(() => {
	vi.useFakeTimers();
	states = [];
});
afterEach(() => vi.useRealTimers());

const rowTitle = () => states.at(-1)!.links[0]?.title;

describe('the store polls a new link’s details', () => {
	it('every second until meta_state is not pending, putting the title, icon and preview in the row', async () => {
		const api = fakeApi([
			{},
			{},
			{ metaState: 'ok', title: 'The real title', faviconPath: 'a.webp', imagePath: 'b.webp' }
		]);
		const store = createApiStore(api.fetcher);
		store.subscribe((s) => states.push(s));
		await store.put({ url: 'https://blog.example/post' });
		expect(rowTitle()).toBe('blog.example');
		await vi.advanceTimersByTimeAsync(999);
		expect(api.gets).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(1);
		expect(api.gets).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(api.gets).toHaveLength(3);
		const row = states.at(-1)!.links[0];
		expect([row.title, row.faviconPath, row.imagePath, row.metaState]).toEqual([
			'The real title',
			'a.webp',
			'b.webp',
			'ok'
		]);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(api.gets).toHaveLength(3); // stopped
	});

	it('gives up after 10 s of pending', async () => {
		const api = fakeApi([{}]);
		const store = createApiStore(api.fetcher);
		store.subscribe((s) => states.push(s));
		await store.put({ url: 'https://blog.example/post' });
		await vi.advanceTimersByTimeAsync(30_000);
		expect(api.gets).toHaveLength(10);
	});

	it('a failed fetch ends the polling, the row keeping its hostname title', async () => {
		const api = fakeApi([{ metaState: 'failed' }]);
		const store = createApiStore(api.fetcher);
		store.subscribe((s) => states.push(s));
		await store.put({ url: 'https://blog.example/post' });
		await vi.advanceTimersByTimeAsync(5_000);
		expect(api.gets).toHaveLength(1);
		expect(rowTitle()).toBe('blog.example');
	});

	it('does not poll for a duplicate (its details are already there)', async () => {
		const api = fakeApi([{}], { duplicate: true });
		const store = createApiStore(api.fetcher);
		await store.put({ url: 'https://blog.example/post' });
		await vi.advanceTimersByTimeAsync(5_000);
		expect(api.gets).toHaveLength(0);
	});

	it('stops when the link was deleted, and never puts it back', async () => {
		const api = fakeApi([{}, { metaState: 'ok', title: 'late' }]);
		const store = createApiStore(api.fetcher);
		store.subscribe((s) => states.push(s));
		const { link } = await store.put({ url: 'https://blog.example/post' });
		await store.remove(link.id).catch(() => {});
		await vi.advanceTimersByTimeAsync(5_000);
		expect(states.at(-1)!.links).toEqual([]);
	});
});
