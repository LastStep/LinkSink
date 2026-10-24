import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classifyMedia } from '../classify/media.ts';
import { matchSource, type SourceRow } from '../classify/source.ts';
import { links } from '../db/schema.ts';
import { createSyncWrite } from '../sync/write.ts';
import { addUser, tempDatabase } from '../test/db.ts';
import { decodeHtml, parseHead } from './head.ts';
import { fetchImage, MEDIA_NAME, serveMedia, storeImageBytes } from './images.ts';
import { fetchMeta } from './meta.ts';
import { markFailed } from './refresh.ts';
import {
	createSafeFetch,
	FetchFailed,
	FetchRefused,
	IMAGE_MAX_BYTES,
	linkSinkUserAgent
} from './safe.ts';
import { startStub } from './test/servers.ts';

/**
 * Tests that pin behaviour the verifiers' mutants showed nothing else held (M-2026-10-24-4402dc7f, item 4). Each
 * names the mutation it was seen failing on, in the run report.
 */
const PUBLIC = '93.184.216.34';
let stub: Awaited<ReturnType<typeof startStub>>;
let safeFetch: ReturnType<typeof createSafeFetch>;
let exactImage: Buffer;
let overImage: Buffer;

/** A valid PNG padded with bytes after its end to exactly `size` bytes (decoders ignore trailing data). */
async function pngOfSize(size: number) {
	const png = await sharp({
		create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } }
	})
		.png()
		.toBuffer();
	return Buffer.concat([png, Buffer.alloc(size - png.length)]);
}

beforeAll(async () => {
	exactImage = await pngOfSize(IMAGE_MAX_BYTES);
	overImage = await pngOfSize(IMAGE_MAX_BYTES + 1);
	stub = await startStub((req, res) => {
		const url = new URL(req.url ?? '/', 'http://stub');
		const to = url.searchParams.get('to');
		if (url.pathname === '/redirect' && to) res.writeHead(302, { location: to }).end();
		else if (url.pathname === '/exact.png')
			res.writeHead(200, { 'content-type': 'image/png' }).end(exactImage);
		else if (url.pathname === '/over.png')
			res.writeHead(200, { 'content-type': 'image/png' }).end(overImage);
		else res.writeHead(200, { 'content-type': 'text/html' }).end('<title>page</title>');
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

const at = (path: string) => `http://site.test:${stub.port}${path}`;
const page = (url: string) => ({
	url,
	accept: 'text/html',
	maxBytes: 1024 * 1024,
	overflow: 'truncate' as const
});

describe('each redirect hop is checked for scheme and port again', () => {
	it.each([
		['ftp://site.test/file', /only http and https/],
		['file:///etc/passwd', /only http and https/],
		['http://site.test:8080/', /port 8080/],
		['https://site.test:22/', /port 22/]
	])('a redirect to %s is refused', async (target, message) => {
		const before = stub.seen.length;
		const error = await safeFetch(page(at(`/redirect?to=${encodeURIComponent(target)}`))).catch(
			(e) => e
		);
		expect(error).toBeInstanceOf(FetchRefused);
		expect(error.message).toMatch(message);
		expect(stub.seen.length - before).toBe(1); // only the first hop was requested
	});
});

describe('the 5 MB image cap, at its boundary', () => {
	it('is 5 MB', () => {
		expect(IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
	});

	it('an image of exactly 5 MB is fetched and stored; one byte more is refused', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'linksink-cap-'));
		try {
			expect(exactImage.length).toBe(IMAGE_MAX_BYTES);
			expect(await fetchImage(safeFetch, dir, 'favicon', at('/exact.png'))).toMatch(
				/^[0-9a-f]{64}\.webp$/
			);
			expect(overImage.length).toBe(IMAGE_MAX_BYTES + 1);
			expect(await fetchImage(safeFetch, dir, 'preview', at('/over.png'))).toBeNull();
			expect(readdirSync(dir)).toHaveLength(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('the guard reads exactly maxBytes and fails at maxBytes + 1', async () => {
		const req = { accept: 'image/*', maxBytes: IMAGE_MAX_BYTES, overflow: 'fail' as const };
		const exact = await safeFetch({ ...req, url: at('/exact.png') });
		expect(exact.body.length).toBe(IMAGE_MAX_BYTES);
		await expect(safeFetch({ ...req, url: at('/over.png') })).rejects.toMatchObject({
			name: 'FetchFailed',
			reason: 'too-large'
		});
		await expect(safeFetch({ ...req, url: at('/over.png') })).rejects.toBeInstanceOf(FetchFailed);
	});
});

describe('the page request', () => {
	it('asks for text/html', async () => {
		const before = stub.seen.length;
		await fetchMeta(safeFetch, at('/a-page'));
		const request = stub.seen.slice(before).find((s) => s.path === '/a-page');
		expect(request?.headers.accept).toBe('text/html');
	});
});

describe('media rule order', () => {
	it('rule 1 (the extension) before rule 2 (host and path)', () => {
		// a file inside a GitHub repository: rule 2 alone would say Repo
		expect(classifyMedia({ url: 'https://github.com/owner/repo/raw/main/paper.pdf' })).toBe('pdf');
		expect(classifyMedia({ url: 'https://github.com/owner/repo/blob/main/diagram.png' })).toBe(
			'image'
		);
	});

	it('rule 4 (og:type) before rule 5 (the oEmbed type)', () => {
		expect(
			classifyMedia({ url: 'https://blog.example/post', ogType: 'article', oembedType: 'video' })
		).toBe('article');
		expect(
			classifyMedia({ url: 'https://blog.example/post', ogType: 'article', oembedType: 'photo' })
		).toBe('article');
	});
});

describe('source matching', () => {
	it('the longest suffix wins whatever order the rows come in', () => {
		const yc: SourceRow = { id: 'yc', name: 'Y Combinator', hosts: ['ycombinator.com'] };
		const hn: SourceRow = { id: 'hn', name: 'Hacker News', hosts: ['news.ycombinator.com'] };
		expect(matchSource('news.ycombinator.com', [yc, hn])?.id).toBe('hn');
		expect(matchSource('news.ycombinator.com', [hn, yc])?.id).toBe('hn');
		// and within one row's hosts
		const both: SourceRow = { id: 'both', name: 'Both', hosts: ['ycombinator.com'] };
		const deep: SourceRow = {
			id: 'deep',
			name: 'Deep',
			hosts: ['x.example', 'news.ycombinator.com']
		};
		expect(matchSource('news.ycombinator.com', [both, deep])?.id).toBe('deep');
		expect(matchSource('news.ycombinator.com', [deep, both])?.id).toBe('deep');
	});
});

describe('the failure path', () => {
	it('keeps a title the person set, and does not set one they cleared', () => {
		const t = tempDatabase();
		try {
			addUser(t.db, 'u1');
			const syncWrite = createSyncWrite(t.db);
			syncWrite('u1', (w) => {
				w.insert(links, {
					id: 'set',
					url: 'https://blocked.example/a',
					urlKey: 'a',
					title: 'My own title',
					userSet: JSON.stringify(['title']),
					savedVia: 'paste'
				});
				w.insert(links, {
					id: 'earlier',
					url: 'https://blocked.example/c',
					urlKey: 'c',
					title: 'Title from an earlier fetch',
					savedVia: 'paste'
				});
				w.insert(links, {
					id: 'cleared',
					url: 'https://blocked.example/b',
					urlKey: 'b',
					title: null,
					userSet: JSON.stringify(['title']),
					savedVia: 'paste'
				});
			});
			markFailed({ db: t.db, syncWrite }, 'set');
			markFailed({ db: t.db, syncWrite }, 'cleared');
			const row = (id: string) => t.db.select().from(links).where(eq(links.id, id)).get()!;
			expect([row('set').title, row('set').metaState]).toEqual(['My own title', 'failed']);
			expect([row('cleared').title, row('cleared').metaState]).toEqual([null, 'failed']);
			// a title already there (not the person's) also stays: the failure only fills an empty one
			markFailed({ db: t.db, syncWrite }, 'earlier');
			expect(row('earlier').title).toBe('Title from an earlier fetch');
		} finally {
			t.close();
		}
	});
});

describe('charset', () => {
	it('the Content-Type header’s charset wins over <meta charset>', () => {
		// windows-1252 bytes, a page that wrongly claims UTF-8, a header that is right
		const body = Buffer.concat([
			Buffer.from('<head><meta charset="utf-8"><title>Caf'),
			Buffer.from([0xe9, 0x20, 0x80]),
			Buffer.from('</title></head>')
		]);
		expect(parseHead(decodeHtml(body, 'text/html; charset=windows-1252')).title).toBe('Café €');
		// and with no header charset, the meta one is used
		expect(parseHead(decodeHtml(body, 'text/html')).title).toBe('Caf� �');
	});
});

describe('the media file-name pattern', () => {
	it('serves only <64 hex>.webp and <64 hex>-320.webp, anchored at both ends', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'linksink-names-'));
		try {
			const png = await sharp({
				create: { width: 700, height: 400, channels: 3, background: { r: 9, g: 9, b: 9 } }
			})
				.png()
				.toBuffer();
			const name = await storeImageBytes(dir, 'preview', png, 'image/png');
			const hash = name.slice(0, 64);
			expect(serveMedia(dir, name).status).toBe(200);
			expect(serveMedia(dir, `${hash}-320.webp`).status).toBe(200);
			for (const bad of [
				`x${hash}.webp`,
				`${hash}.webpx`,
				`${hash}.webp/`,
				`${hash}-640.webp`,
				`${hash}-320-320.webp`,
				`${hash.slice(1)}.webp`,
				`${hash}0.webp`,
				`${hash.slice(0, 63)}g.webp`,
				`${hash}.WEBP`,
				`${hash}.png`
			]) {
				// the file is really there under that name, so only the pattern can refuse it
				if (!bad.endsWith('/')) copyFileSync(join(dir, name), join(dir, bad));
				expect(serveMedia(dir, bad).status, bad).toBe(404);
				expect(MEDIA_NAME.test(bad), bad).toBe(false);
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
