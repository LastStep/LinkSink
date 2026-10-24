import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeHtml, parseHead } from './head.ts';
import {
	fetchMeta,
	knownOEmbedEndpoint,
	mergeMeta,
	metaFromHead,
	parseDuration,
	parseOEmbed,
	type PageMeta
} from './meta.ts';
import { createSafeFetch, FetchFailed, linkSinkUserAgent } from './safe.ts';
import { startStub } from './test/servers.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

/** Reads a recorded page as the fetcher would: decode, parse the head, merge with its oEmbed. */
function read(
	name: string,
	url: string,
	{
		contentType = 'text/html; charset=utf-8',
		oembed
	}: { contentType?: string; oembed?: string } = {}
): PageMeta {
	const head = metaFromHead(parseHead(decodeHtml(fixture(name), contentType)), url);
	const o = oembed ? parseOEmbed(fixture(oembed)) : null;
	return mergeMeta(head, o, {
		finalUrl: url,
		contentType,
		isX: new URL(url).hostname === 'x.com'
	});
}

describe('meta from recorded pages', () => {
	it('og tags (an article)', () => {
		const m = read('og-article.html', 'https://simonwillison.net/2024/Dec/31/llms-in-2024/');
		expect(m.title).toBe('Things we learned about LLMs in 2024');
		expect(m.description).toMatch(/^A lot has happened in the world of Large Language Models/);
		expect(m.siteName).toBe('Simon Willison’s Weblog');
		expect(m.author).toBe('Simon Willison');
		expect(m.imageUrl).toBe('https://static.simonwillison.net/static/2024/arena-dec-2024.jpg');
		expect(m.ogType).toBe('article');
		expect(m.iconUrl).toBe('https://simonwillison.net/favicon.ico');
	});

	it('twitter tags only', () => {
		const m = read('twitter-only.html', 'https://cards.example.com/post/1');
		expect(m.title).toBe('Card title from Twitter tags');
		expect(m.description).toBe('A description only the Twitter card gives.');
		expect(m.imageUrl).toBe('https://cards.example.com/images/card.png');
		// the smallest icon of 64 px or more
		expect(m.iconUrl).toBe('https://cards.example.com/favicon-64.png');
	});

	it('JSON-LD only (an @graph, after a broken block)', () => {
		const m = read('jsonld.html', 'https://news.example.org/a');
		expect(m.title).toBe('Headline from JSON-LD & friends');
		expect(m.description).toBe('Summary from JSON-LD.');
		expect(m.author).toBe('Ada Lovelace');
		expect(m.siteName).toBe('Example News');
		expect(m.publishedAt).toBe(Date.parse('2025-03-14T09:26:53Z'));
		expect(m.durationS).toBe(3723);
		expect(m.imageUrl).toBe('https://cdn.example.org/lead.jpg');
	});

	it('<title> only (example.com)', () => {
		const m = read('title-only.html', 'https://example.com/');
		expect(m.title).toBe('Example Domain');
		expect(m.description).toBeNull();
		expect(m.imageUrl).toBeNull();
		// its only icon is a data: URL, which is never fetched
		expect(m.iconUrl).toBe('https://example.com/favicon.ico');
	});

	it('broken charset: an unknown label in the header falls back to UTF-8', () => {
		const m = read('charset-bogus.html', 'https://example.net/', {
			contentType: 'text/html; charset=utf-8lol'
		});
		expect(m.title).toBe('Café crème — naïve');
	});

	it('broken charset: windows-1252 bytes declared only in <meta charset>', () => {
		const m = read('charset-windows-1252.html', 'https://example.net/', {
			contentType: 'text/html'
		});
		expect(m.title).toBe('Café “quoted” € price');
		expect(m.description).toBe('Résumé in Latin-1 bytes');
	});

	it('YouTube: oEmbed title, author and thumbnail; date and length from the page', () => {
		const m = read('youtube-watch.html', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
			oembed: 'youtube-oembed.json'
		});
		expect(m.title).toBe('Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)');
		expect(m.author).toBe('Rick Astley');
		expect(m.imageUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
		expect(m.siteName).toBe('YouTube');
		expect(m.publishedAt).toBe(Date.parse('2009-10-24T23:57:33-07:00'));
		expect(m.durationS).toBe(214);
		expect(m.description).toMatch(/^The official video for “Never Gonna Give You Up”/);
		expect(m.ogType).toBe('video.other');
		expect(m.oembedType).toBe('video');
		expect(m.iconUrl).toBe('https://www.youtube.com/s/desktop/dc0b62b0/img/favicon_96x96.png');
	});

	it('YouTube page without its oEmbed still gives title and image from og tags', () => {
		const m = read('youtube-watch.html', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		expect(m.title).toBe('Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)');
		expect(m.imageUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg');
	});

	it("X: title and image from the x.com page's og tags, author from its oEmbed", () => {
		const m = read('x-status.html', 'https://x.com/jack/status/20', { oembed: 'x-oembed.json' });
		expect(m.title).toBe('jack (@jack) on X');
		expect(m.description).toBe('just setting up my twttr');
		expect(m.imageUrl).toBe(
			'https://pbs.twimg.com/profile_images/1661201415899951105/azNjKOSH_400x400.jpg'
		);
		expect(m.author).toBe('jack');
		expect(m.siteName).toBe('X (formerly Twitter)');
	});

	it("X oEmbed's tweet text is the fallback description", () => {
		const o = parseOEmbed(fixture('x-oembed.json'));
		expect(o?.text).toBe('just setting up my twttr');
		expect(o?.title).toBeNull(); // X's oEmbed has no title
		const m = mergeMeta(null, o, {
			finalUrl: 'https://x.com/jack/status/20',
			contentType: null,
			isX: true
		});
		expect(m.description).toBe('just setting up my twttr');
	});

	it('GitHub and Vimeo pages', () => {
		const gh = read('github-repo.html', 'https://github.com/sveltejs/kit');
		expect(gh.title).toBe('GitHub - sveltejs/kit: web development, streamlined');
		expect(gh.siteName).toBe('GitHub');
		const vimeo = read('vimeo-video.html', 'https://vimeo.com/76979871');
		expect(vimeo.title).toBe('The New Vimeo Player (You Know, For Videos)');
		expect(vimeo.ogType).toBe('video.other');
	});

	it('a bot-check page (Reddit to an honest User-Agent) gives only what it says', () => {
		const m = read(
			'reddit-challenge.html',
			'https://www.reddit.com/r/programming/comments/1b3k8ag/'
		);
		expect(m.title).toBe('Reddit');
		expect(m.imageUrl).toBeNull();
	});
});

describe('meta helpers', () => {
	it.each([
		['PT3M34S', 214],
		['PT1H2M3S', 3723],
		['P1DT1S', 86401],
		['PT0.5S', 1],
		['125', 125],
		['', null],
		['P', null],
		['PT', null],
		['soon', null]
	])('parseDuration(%j) = %j', (input, expected) => {
		expect(parseDuration(input)).toBe(expected);
	});

	it('knows the YouTube and X oEmbed endpoints only', () => {
		expect(knownOEmbedEndpoint(new URL('https://youtu.be/dQw4w9WgXcQ'))).toBe(
			'https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ'
		);
		expect(knownOEmbedEndpoint(new URL('https://m.youtube.com/watch?v=abc'))).toMatch(
			/^https:\/\/www\.youtube\.com\/oembed\?/
		);
		expect(knownOEmbedEndpoint(new URL('https://www.youtube.com/shorts/abc'))).not.toBeNull();
		expect(knownOEmbedEndpoint(new URL('https://twitter.com/jack/status/20'))).toMatch(
			/^https:\/\/publish\.x\.com\/oembed\?/
		);
		expect(knownOEmbedEndpoint(new URL('https://www.youtube.com/@RickAstleyYT'))).toBeNull();
		expect(knownOEmbedEndpoint(new URL('https://x.com/jack'))).toBeNull();
		expect(knownOEmbedEndpoint(new URL('https://example.com/watch?v=1'))).toBeNull();
	});

	it('script text containing </head> does not end the head', () => {
		const tags = parseHead(
			'<head><script>var s = "</head><body>";</script><meta property="og:title" content="After"></head>'
		);
		expect(tags.meta.get('og:title')).toBe('After');
	});

	it('stops at </head>: body tags are ignored', () => {
		const tags = parseHead(
			'<head><title>Head</title></head><body><meta property="og:title" content="Body"></body>'
		);
		expect(tags.meta.has('og:title')).toBe(false);
		expect(tags.title).toBe('Head');
	});
});

describe('fetchMeta through the guarded fetch (local stub, no internet)', () => {
	const PUBLIC = '93.184.216.34';
	let stub: Awaited<ReturnType<typeof startStub>>;
	let safeFetch: ReturnType<typeof createSafeFetch>;

	beforeAll(async () => {
		stub = await startStub((req, res) => {
			const path = req.url ?? '/';
			const send = (type: string, body: Buffer | string, status = 200) =>
				res.writeHead(status, { 'content-type': type }).end(body);
			if (path === '/article') send('text/html; charset=utf-8', fixture('og-article.html'));
			else if (path === '/photo') send('text/html', fixture('oembed-photo.html'));
			else if (path.startsWith('/oembed')) send('application/json', fixture('oembed-photo.json'));
			else if (path === '/latin') send('text/html', fixture('charset-windows-1252.html'));
			else if (path === '/paper.pdf') send('application/pdf', '%PDF-1.7 not really');
			else if (path === '/blocked') send('text/html', 'Forbidden', 403);
			else send('text/plain', 'not found', 404);
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

	it('reads an og page', async () => {
		const m = await fetchMeta(safeFetch, at('/article'));
		expect(m.title).toBe('Things we learned about LLMs in 2024');
		expect(m.ogType).toBe('article');
		expect(m.finalUrl).toBe(at('/article'));
	});

	it('follows a discovered oEmbed link through the same guard', async () => {
		const m = await fetchMeta(safeFetch, at('/photo'));
		expect(m.oembedType).toBe('photo');
		expect(m.author).toBe('Photographer');
		expect(m.imageUrl).toBe(at('/thumb.jpg'));
		const oembedRequest = stub.seen.find((s) => s.path.startsWith('/oembed'));
		expect(oembedRequest?.headers.accept).toBe('application/json');
		expect(oembedRequest?.headers['user-agent']).toBe('LinkSink/1.0 (+https://links.example.com)');
	});

	it('decodes a page whose bytes are windows-1252', async () => {
		const m = await fetchMeta(safeFetch, at('/latin'));
		expect(m.title).toBe('Café “quoted” € price');
	});

	it('reports a non-HTML link by its content type, with no title', async () => {
		const m = await fetchMeta(safeFetch, at('/paper.pdf'));
		expect(m.contentType).toBe('application/pdf');
		expect(m.title).toBeNull();
	});

	it('a site that refuses LinkSink is a failure, not a retry with another identity', async () => {
		const before = stub.seen.length;
		await expect(fetchMeta(safeFetch, at('/blocked'))).rejects.toBeInstanceOf(FetchFailed);
		const requests = stub.seen.slice(before);
		expect(requests).toHaveLength(1);
		expect(requests[0].headers['user-agent']).toBe('LinkSink/1.0 (+https://links.example.com)');
	});
});
