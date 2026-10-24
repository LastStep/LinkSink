import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { links, sources } from '../db/schema.ts';
import { createSyncWrite, type SyncWrite } from '../sync/write.ts';
import { addUser, tempDatabase } from '../test/db.ts';
import {
	hostMatches,
	matchSource,
	registrableDomain,
	resolveSource,
	SEED_SOURCES,
	type SourceRow
} from './source.ts';

let t: ReturnType<typeof tempDatabase>;
let syncWrite: SyncWrite;

beforeEach(() => {
	t = tempDatabase();
	addUser(t.db, 'u1');
	addUser(t.db, 'u2');
	syncWrite = createSyncWrite(t.db);
});
afterEach(() => t.close());

const resolve = (url: string, siteName: string | null = null, user = 'u1') =>
	syncWrite(user, (w) => resolveSource(w, url, siteName));
const nameOf = (id: string) => t.db.select().from(sources).where(eq(sources.id, id)).get()?.name;
const sourcesOf = (user: string) =>
	t.db.select().from(sources).where(eq(sources.userId, user)).all();

describe('host matching', () => {
	it('matches a host or its subdomains, never a lookalike', () => {
		expect(hostMatches('x.com', 'x.com')).toBe(true);
		expect(hostMatches('mobile.x.com', 'x.com')).toBe(true);
		expect(hostMatches('box.com', 'x.com')).toBe(false);
		expect(hostMatches('notyoutube.com', 'youtube.com')).toBe(false);
		expect(hostMatches('WWW.YouTube.com.', 'youtube.com')).toBe(true);
	});

	it('the longest suffix wins', () => {
		const rows: SourceRow[] = [
			{ id: 'yc', name: 'Y Combinator', hosts: ['ycombinator.com'] },
			{ id: 'hn', name: 'Hacker News', hosts: ['news.ycombinator.com'] }
		];
		expect(matchSource('news.ycombinator.com', rows)?.id).toBe('hn');
		expect(matchSource('www.ycombinator.com', rows)?.id).toBe('yc');
		expect(matchSource('example.com', rows)).toBeNull();
	});

	it('registrable domains via the public suffix list', () => {
		expect(registrableDomain('news.bbc.co.uk')).toBe('bbc.co.uk');
		expect(registrableDomain('www.example.com')).toBe('example.com');
		expect(registrableDomain('someone.github.io')).toBe('someone.github.io');
		expect(registrableDomain('93.184.216.34')).toBe('93.184.216.34');
	});
});

describe('resolveSource', () => {
	it('seeds the sources table with the plan’s hosts on first use, once', () => {
		resolve('https://www.youtube.com/watch?v=1');
		resolve('https://github.com/a/b');
		const rows = sourcesOf('u1');
		expect(rows.map((r) => r.name).sort()).toEqual(SEED_SOURCES.map((s) => s.name).sort());
		expect(JSON.parse(rows.find((r) => r.name === 'YouTube')!.hosts)).toEqual([
			'youtube.com',
			'youtu.be',
			'm.youtube.com'
		]);
		expect(rows.every((r) => r.version > 0)).toBe(true);
		expect(sourcesOf('u2')).toEqual([]);
	});

	it.each([
		['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube'],
		['https://youtu.be/dQw4w9WgXcQ', 'YouTube'],
		['https://m.youtube.com/watch?v=1', 'YouTube'],
		['https://x.com/jack/status/20', 'X'],
		['https://twitter.com/jack/status/20', 'X'],
		['https://news.ycombinator.com/item?id=1', 'Hacker News'],
		['https://someone.substack.com/p/post', 'Substack'],
		['https://en.wikipedia.org/wiki/Link', 'Wikipedia'],
		['https://old.reddit.com/r/a/comments/b/', 'Reddit'],
		['https://open.spotify.com/episode/1', 'Spotify'],
		['https://arxiv.org/abs/1706.03762', 'arXiv']
	])('%s is %s', (url, name) => {
		expect(nameOf(resolve(url))).toBe(name);
	});

	it('else a source named after og:site_name, which later links from that domain reuse', () => {
		const first = resolve('https://simonwillison.net/2024/Dec/31/', 'Simon Willison’s Weblog');
		expect(nameOf(first)).toBe('Simon Willison’s Weblog');
		const row = t.db.select().from(sources).where(eq(sources.id, first)).get()!;
		expect(JSON.parse(row.hosts)).toEqual(['simonwillison.net']);
		expect(resolve('https://simonwillison.net/tags/', null)).toBe(first);
	});

	it('a second domain with the same site name joins that source', () => {
		const a = resolve('https://blog.example.com/1', 'Example');
		const b = resolve('https://example.org/2', 'Example');
		expect(b).toBe(a);
		const row = t.db.select().from(sources).where(eq(sources.id, a)).get()!;
		expect(JSON.parse(row.hosts)).toEqual(['example.com', 'example.org']);
	});

	it('else the registrable domain', () => {
		expect(nameOf(resolve('https://www.news.example.co.uk/a'))).toBe('example.co.uk');
	});

	it('a renamed source keeps its new name for later links from its hosts', () => {
		const id = resolve('https://news.ycombinator.com/item?id=1');
		syncWrite('u1', (w) => w.update(sources, eq(sources.id, id), { name: 'HN' }));
		expect(nameOf(resolve('https://news.ycombinator.com/item?id=2'))).toBe('HN');
	});

	it('does not reseed a person who deleted every source', () => {
		resolve('https://github.com/a/b');
		syncWrite('u1', (w) => w.softDelete(sources, eq(sources.userId, 'u1')));
		const id = resolve('https://github.com/a/b');
		expect(nameOf(id)).toBe('github.com');
		expect(sourcesOf('u1').filter((r) => r.deletedAt === null)).toHaveLength(1);
	});

	it('links.source_id references sources (the foreign key holds)', () => {
		expect(() =>
			syncWrite('u1', (w) =>
				w.insert(links, {
					id: 'l1',
					url: 'https://a.example/',
					urlKey: 'https://a.example/',
					savedVia: 'paste',
					sourceId: 'no-such-source'
				})
			)
		).toThrow(/FOREIGN KEY/);
	});
});
