import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fetchImage, MEDIA_NAME, serveMedia, storeImageBytes } from './images.ts';
import { createSafeFetch, linkSinkUserAgent } from './safe.ts';
import { startStub, startTrap } from './test/servers.ts';

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'linksink-media-'));
	return () => rmSync(dir, { recursive: true, force: true });
});

const png = (width: number, height: number) =>
	sharp({ create: { width, height, channels: 4, background: { r: 200, g: 30, b: 60, alpha: 1 } } })
		.png()
		.toBuffer();

/** An ICO file holding one PNG entry. */
async function icoWithPng(size: number) {
	const entry = await png(size, size);
	const header = Buffer.alloc(6 + 16);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(1, 4);
	header[6] = size === 256 ? 0 : size;
	header[7] = size === 256 ? 0 : size;
	header.writeUInt16LE(1, 10);
	header.writeUInt16LE(32, 12);
	header.writeUInt32LE(entry.length, 14);
	header.writeUInt32LE(22, 18);
	return Buffer.concat([header, entry]);
}

/** An ICO file holding one 32-bit BMP entry of a solid colour. */
function icoWithBmp(size: number) {
	const pixels = Buffer.alloc(size * size * 4);
	for (let i = 0; i < size * size; i++) pixels.set([255, 0, 0, 255], i * 4); // BGRA: blue
	const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
	const info = Buffer.alloc(40);
	info.writeUInt32LE(40, 0);
	info.writeInt32LE(size, 4);
	info.writeInt32LE(size * 2, 8);
	info.writeUInt16LE(1, 12);
	info.writeUInt16LE(32, 14);
	const entry = Buffer.concat([info, pixels, mask]);
	const header = Buffer.alloc(22);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(1, 4);
	header[6] = size;
	header[7] = size;
	header.writeUInt32LE(entry.length, 14);
	header.writeUInt32LE(22, 18);
	return Buffer.concat([header, entry]);
}

describe('storeImageBytes', () => {
	it('stores a preview as WebP at 640 and 320 px wide, named by SHA-256', async () => {
		const name = await storeImageBytes(dir, 'preview', await png(1600, 900), 'image/png');
		expect(name).toMatch(/^[0-9a-f]{64}\.webp$/);
		const files = readdirSync(dir).sort();
		expect(files).toEqual([name.replace('.webp', '-320.webp'), name].sort());
		const large = await sharp(join(dir, name)).metadata();
		const small = await sharp(join(dir, name.replace('.webp', '-320.webp'))).metadata();
		expect([large.format, large.width, large.height]).toEqual(['webp', 640, 360]);
		expect([small.format, small.width]).toEqual(['webp', 320]);
		for (const f of files) expect(f).toMatch(MEDIA_NAME);
	});

	it('never enlarges a small preview', async () => {
		const name = await storeImageBytes(dir, 'preview', await png(200, 100), 'image/png');
		expect((await sharp(join(dir, name)).metadata()).width).toBe(200);
	});

	it('stores a favicon at 64 x 64', async () => {
		const name = await storeImageBytes(dir, 'favicon', await png(32, 32), 'image/png');
		const meta = await sharp(join(dir, name)).metadata();
		expect([meta.format, meta.width, meta.height]).toEqual(['webp', 64, 64]);
	});

	it('rasterises an SVG favicon; the stored file holds no SVG', async () => {
		const svg = Buffer.from(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><script>alert(1)</script><circle cx="8" cy="8" r="7" fill="#c03"/></svg>'
		);
		const name = await storeImageBytes(dir, 'favicon', svg, 'image/svg+xml');
		const meta = await sharp(join(dir, name)).metadata();
		expect([meta.format, meta.width]).toEqual(['webp', 64]);
		const response = serveMedia(dir, name);
		const bytes = Buffer.from(await response.arrayBuffer());
		expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
		expect(bytes.includes(Buffer.from('<svg'))).toBe(false);
	});

	it('unpacks an ICO with a PNG entry and one with a 32-bit BMP entry', async () => {
		const fromPng = await storeImageBytes(dir, 'favicon', await icoWithPng(48), 'image/x-icon');
		expect((await sharp(join(dir, fromPng)).metadata()).width).toBe(64);
		const fromBmp = await storeImageBytes(
			dir,
			'favicon',
			icoWithBmp(16),
			'image/vnd.microsoft.icon'
		);
		const { data, info } = await sharp(join(dir, fromBmp))
			.raw()
			.toBuffer({ resolveWithObject: true });
		// centre pixel: the BMP's blue
		const at = (32 * 64 + 32) * info.channels;
		expect([data[at], data[at + 1], data[at + 2]]).toEqual([0, 0, 255]);
	});

	it('the same bytes as preview and as favicon get different names', async () => {
		const bytes = await png(100, 100);
		const a = await storeImageBytes(dir, 'preview', bytes, 'image/png');
		const b = await storeImageBytes(dir, 'favicon', bytes, 'image/png');
		expect(a).not.toBe(b);
	});

	it('refuses bytes that are not an image', async () => {
		await expect(
			storeImageBytes(dir, 'preview', Buffer.from('<html>hi</html>'), 'image/png')
		).rejects.toThrow();
		expect(readdirSync(dir)).toEqual([]);
	});
});

describe('serveMedia', () => {
	it('serves a stored file as image/webp with nosniff', async () => {
		const name = await storeImageBytes(dir, 'preview', await png(10, 10), 'image/png');
		const response = serveMedia(dir, name);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/webp');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
	});

	it.each([
		'../test.db',
		'..%2Ftest.db',
		'abc.webp',
		`${'a'.repeat(64)}.svg`,
		`${'a'.repeat(64)}.webp.html`,
		`${'A'.repeat(64)}.webp`,
		''
	])('refuses the name %j', (name) => {
		expect(serveMedia(dir, name).status).toBe(404);
	});

	it('404s a well-formed name that is not stored', () => {
		expect(serveMedia(dir, `${'0'.repeat(64)}.webp`).status).toBe(404);
	});
});

describe('fetchImage through the guarded fetch', () => {
	const PUBLIC = '93.184.216.34';
	let stub: Awaited<ReturnType<typeof startStub>>;
	let trap: Awaited<ReturnType<typeof startTrap>>;
	let safeFetch: ReturnType<typeof createSafeFetch>;
	let bigPng: Buffer;
	let smallPng: Buffer;

	beforeAll(async () => {
		smallPng = await png(800, 400);
		// > 5 MB: random noise does not compress
		bigPng = await sharp(
			Buffer.from(Array.from({ length: 1800 * 1200 * 3 }, () => (Math.random() * 256) | 0)),
			{
				raw: { width: 1800, height: 1200, channels: 3 }
			}
		)
			.png({ compressionLevel: 0 })
			.toBuffer();
		trap = await startTrap();
		stub = await startStub((req, res) => {
			if (req.url === '/image.png')
				res.writeHead(200, { 'content-type': 'image/png' }).end(smallPng);
			else if (req.url === '/huge.png')
				res.writeHead(200, { 'content-type': 'image/png' }).end(bigPng);
			else if (req.url === '/page.html')
				res.writeHead(200, { 'content-type': 'text/html' }).end(smallPng);
			else if (req.url === '/to-trap')
				res.writeHead(302, { location: `http://127.0.0.1:${trap.port}/x.png` }).end();
			else if (req.url === '/evil.svg')
				res
					.writeHead(200, { 'content-type': 'image/svg+xml' })
					.end(
						`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16"><image href="http://127.0.0.1:${trap.port}/x.png" width="16" height="16"/><image xlink:href="file:///etc/passwd" width="16" height="16"/></svg>`
					);
			else res.writeHead(404).end();
		});
		safeFetch = createSafeFetch({
			userAgent: linkSinkUserAgent('links.example.com'),
			ports: new Set([stub.port, trap.port]),
			resolve: async () => [PUBLIC],
			dialFor: (address, port) =>
				address === PUBLIC ? { host: '127.0.0.1', port: stub.port } : { host: address, port }
		});
	});

	afterAll(async () => {
		await safeFetch.close();
		await stub.close();
		await trap.close();
	});

	const at = (path: string) => `http://img.test:${stub.port}${path}`;

	it('stores an image the guard fetched, with an image Accept and the honest User-Agent', async () => {
		const name = await fetchImage(safeFetch, dir, 'preview', at('/image.png'));
		expect(name).toMatch(MEDIA_NAME);
		const seen = stub.seen.find((s) => s.path === '/image.png');
		expect(seen?.headers.accept).toMatch(/^image\//);
		expect(seen?.headers['user-agent']).toBe('LinkSink/1.0 (+https://links.example.com)');
	});

	it('refuses an image over 5 MB', async () => {
		expect(bigPng.length).toBeGreaterThan(5 * 1024 * 1024);
		expect(await fetchImage(safeFetch, dir, 'preview', at('/huge.png'))).toBeNull();
		expect(readdirSync(dir)).toEqual([]);
	});

	it('refuses a response that is not an image type', async () => {
		expect(await fetchImage(safeFetch, dir, 'preview', at('/page.html'))).toBeNull();
	});

	it('an image URL redirecting to 127.0.0.1 is refused; the trap is never reached', async () => {
		trap.reset();
		expect(await fetchImage(safeFetch, dir, 'favicon', at('/to-trap'))).toBeNull();
		expect(trap.connections).toBe(0);
	});

	it('an SVG pointing at local files and addresses loads neither', async () => {
		trap.reset();
		const name = await fetchImage(safeFetch, dir, 'favicon', at('/evil.svg'));
		// rasterised or refused, it never reaches out
		if (name) expect(name).toMatch(MEDIA_NAME);
		await new Promise((r) => setTimeout(r, 50));
		expect(trap.connections).toBe(0);
	});

	it('no URL, no fetch', async () => {
		expect(await fetchImage(safeFetch, dir, 'preview', null)).toBeNull();
	});
});
