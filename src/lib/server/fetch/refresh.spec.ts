import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { links, sources, syncMeta } from '../db/schema.ts';
import { createSyncWrite, type SyncWrite } from '../sync/write.ts';
import { addUser, tempDatabase } from '../test/db.ts';
import { createFetchQueue } from './queue.ts';
import { markFailed, refreshLink, type FetchDeps } from './refresh.ts';
import { createSafeFetch, linkSinkUserAgent } from './safe.ts';
import { fixture } from './test/fixtures.ts';
import { startStub } from './test/servers.ts';

const PUBLIC = '93.184.216.34';
let stub: Awaited<ReturnType<typeof startStub>>;
let safeFetch: ReturnType<typeof createSafeFetch>;
let t: ReturnType<typeof tempDatabase>;
let syncWrite: SyncWrite;
let deps: FetchDeps;
let mediaDir: string;

beforeAll(async () => {
	const png = await sharp({
		create: { width: 900, height: 500, channels: 3, background: { r: 10, g: 120, b: 200 } }
	})
		.png()
		.toBuffer();
	const article = fixture('og-article.html')
		.toString()
		.replaceAll('https://static.simonwillison.net/static/2024/arena-dec-2024.jpg', '/lead.png')
		.replace('</head>', '<link rel="icon" href="/icon.svg" type="image/svg+xml"></head>');
	stub = await startStub((req, res) => {
		const path = req.url ?? '/';
		if (path === '/article') res.writeHead(200, { 'content-type': 'text/html' }).end(article);
		else if (path === '/lead.png') res.writeHead(200, { 'content-type': 'image/png' }).end(png);
		else if (path === '/icon.svg')
			res
				.writeHead(200, { 'content-type': 'image/svg+xml' })
				.end(
					'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4"/></svg>'
				);
		else if (path === '/video.html')
			res.writeHead(200, { 'content-type': 'text/html' }).end(fixture('vimeo-video.html'));
		else res.writeHead(403, { 'content-type': 'text/html' }).end('Forbidden to bots');
	});
	safeFetch = createSafeFetch({
		userAgent: linkSinkUserAgent('links.example.com'),
		ports: new Set([stub.port]),
		resolve: async () => [PUBLIC],
		dialFor: (address, port) =>
			address === PUBLIC ? { host: '127.0.0.1', port: stub.port } : { host: address, port }
	});
});
afterAll(async () => {
	await safeFetch.close();
	await stub.close();
});

beforeEach(() => {
	t = tempDatabase();
	addUser(t.db, 'u1');
	syncWrite = createSyncWrite(t.db);
	mediaDir = mkdtempSync(join(tmpdir(), 'linksink-media-'));
	deps = { db: t.db, syncWrite, safeFetch, mediaDir };
});
afterEach(() => {
	t.close();
	rmSync(mediaDir, { recursive: true, force: true });
});

const at = (path: string) => `http://blog.test:${stub.port}${path}`;
const row = (id: string) => t.db.select().from(links).where(eq(links.id, id)).get()!;
const sourceName = (id: string | null) =>
	id ? t.db.select().from(sources).where(eq(sources.id, id)).get()?.name : undefined;
const userVersion = () =>
	t.db.select().from(syncMeta).where(eq(syncMeta.userId, 'u1')).get()?.version ?? 0;

function save(id: string, url: string, extra: Partial<typeof links.$inferInsert> = {}) {
	syncWrite('u1', (w) => w.insert(links, { id, url, urlKey: url, savedVia: 'paste', ...extra }));
}

describe('refreshLink', () => {
	it('fills the details, the cached images, source and media, through syncWrite', async () => {
		save('a', at('/article'));
		const before = row('a');
		expect(before.metaState).toBe('pending');

		expect(await refreshLink(deps, 'a')).toBe(true);
		const after = row('a');
		expect(after.title).toBe('Things we learned about LLMs in 2024');
		expect(after.description).toMatch(/^A lot has happened/);
		expect(after.siteName).toBe('Simon Willison’s Weblog');
		expect(after.author).toBe('Simon Willison');
		expect(after.media).toBe('article');
		expect(sourceName(after.sourceId)).toBe('Simon Willison’s Weblog');
		expect(after.metaState).toBe('ok');
		expect(after.metaFetchedAt).toBeGreaterThan(0);
		expect(after.imagePath).toMatch(/^[0-9a-f]{64}\.webp$/);
		expect(after.faviconPath).toMatch(/^[0-9a-f]{64}\.webp$/);
		expect(existsSync(join(mediaDir, after.imagePath!))).toBe(true);
		expect(existsSync(join(mediaDir, after.faviconPath!))).toBe(true);
		// the cache holds WebP only: preview 640 and 320, icon 64; no SVG or PNG kept
		for (const file of readdirSync(mediaDir)) {
			expect(file).toMatch(/^[0-9a-f]{64}(-320)?\.webp$/);
			expect(readFileSync(join(mediaDir, file)).subarray(8, 12).toString()).toBe('WEBP');
		}
		// one write, its version stamped on the link
		expect(after.version).toBeGreaterThan(before.version);
		expect(after.version).toBe(userVersion());
	});

	it('a refetch never writes title, description, source or media the person set', async () => {
		save('a', at('/article'));
		const mine = syncWrite('u1', (w) => {
			const id = 'mine';
			w.insert(sources, { id, name: 'My reading', hosts: '[]' });
			return id;
		});
		syncWrite('u1', (w) =>
			w.update(links, eq(links.id, 'a'), {
				title: 'My title',
				description: 'My words',
				sourceId: mine,
				media: 'podcast',
				userSet: JSON.stringify(['title', 'description', 'source', 'media'])
			})
		);
		await refreshLink(deps, 'a');
		await refreshLink(deps, 'a'); // and again
		const after = row('a');
		expect([after.title, after.description, after.sourceId, after.media]).toEqual([
			'My title',
			'My words',
			mine,
			'podcast'
		]);
		// what the person did not set is still filled in
		expect(after.siteName).toBe('Simon Willison’s Weblog');
		expect(after.metaState).toBe('ok');
	});

	it('only the fields in user_set are kept; the others are refreshed', async () => {
		save('a', at('/video.html'), {
			title: 'Kept',
			media: 'article',
			userSet: JSON.stringify(['title'])
		});
		await refreshLink(deps, 'a');
		const after = row('a');
		expect(after.title).toBe('Kept');
		expect(after.media).toBe('video');
		expect(sourceName(after.sourceId)).toBe('Vimeo');
	});

	it('a link deleted before its fetch is left alone', async () => {
		save('a', at('/article'));
		syncWrite('u1', (w) => w.softDelete(links, eq(links.id, 'a')));
		expect(await refreshLink(deps, 'a')).toBe(false);
		expect(row('a').metaState).toBe('pending');
	});
});

describe('markFailed', () => {
	it('sets meta_state failed; the title is the hostname; source and media from the URL', () => {
		save('a', 'https://www.reddit.com/r/programming/comments/1b3k8ag/');
		markFailed(deps, 'a');
		const after = row('a');
		expect(after.metaState).toBe('failed');
		expect(after.title).toBe('reddit.com');
		expect(sourceName(after.sourceId)).toBe('Reddit');
		expect(after.media).toBe('post');
		expect(after.version).toBe(userVersion());
	});

	it('keeps a title that is already there', () => {
		save('a', 'https://blocked.example/x', { title: 'blocked.example' });
		markFailed(deps, 'a');
		expect(row('a').title).toBe('blocked.example');
	});
});

describe('the queue with the real fetcher', () => {
	it('a site that blocks LinkSink: the link still saves, failed, titled by its host', async () => {
		save('a', at('/blocked'));
		let calls = 0;
		const queue = createFetchQueue({
			work: (id) => {
				calls++;
				return refreshLink(deps, id);
			},
			onGiveUp: (id) => markFailed(deps, id),
			retryDelayMs: 10
		});
		queue.enqueue('a');
		await queue.idle();
		expect(calls).toBe(2); // tried, then retried once
		const after = row('a');
		expect(after.metaState).toBe('failed');
		expect(after.title).toBe('blog.test');
		const blocked = stub.seen.filter((s) => s.path === '/blocked');
		expect(new Set(blocked.map((s) => s.headers['user-agent']))).toEqual(
			new Set(['LinkSink/1.0 (+https://links.example.com)'])
		);
	});

	it('a URL the guard refuses is not retried', async () => {
		save('a', 'http://127.0.0.1/admin');
		let calls = 0;
		const queue = createFetchQueue({
			work: (id) => {
				calls++;
				return refreshLink(deps, id);
			},
			onGiveUp: (id) => markFailed(deps, id),
			retryDelayMs: 10
		});
		queue.enqueue('a');
		await queue.idle();
		expect(calls).toBe(1);
		expect(row('a').metaState).toBe('failed');
		expect(row('a').title).toBe('127.0.0.1');
	});
});
