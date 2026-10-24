import { decodeHtml, headIsComplete, parseHead, type HeadTags } from './head.ts';
import { FetchFailed, PAGE_MAX_BYTES, type SafeFetch } from './safe.ts';

/** Everything the fetcher learns about a link, before classification and before the person's edits are applied. */
export interface PageMeta {
	/** The URL after redirects. */
	finalUrl: string;
	contentType: string | null;
	title: string | null;
	description: string | null;
	siteName: string | null;
	author: string | null;
	/** Milliseconds since the epoch. */
	publishedAt: number | null;
	durationS: number | null;
	iconUrl: string | null;
	imageUrl: string | null;
	/** og:type, for the media classifier. */
	ogType: string | null;
	/** The oEmbed `type`, for the media classifier. */
	oembedType: string | null;
}

/** The oEmbed fields LinkSink reads (https://oembed.com). */
export interface OEmbed {
	type: string | null;
	title: string | null;
	authorName: string | null;
	providerName: string | null;
	thumbnailUrl: string | null;
	/** X: the tweet's text, taken from the first paragraph of its `html`. */
	text: string | null;
}

const TITLE_MAX = 500;
const DESCRIPTION_MAX = 2000;
const OEMBED_MAX_BYTES = 256 * 1024;

function clean(value: unknown, max = TITLE_MAX): string | null {
	if (typeof value !== 'string') return null;
	const text = value.replace(/\s+/g, ' ').trim();
	if (!text) return null;
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function first<T>(...values: (T | null | undefined)[]): T | null {
	for (const v of values) if (v !== null && v !== undefined) return v;
	return null;
}

/** An absolute http(s) URL for `href` relative to `base`, or null. */
function absolute(href: string | null | undefined, base: string): string | null {
	if (!href) return null;
	const url = URL.parse(href.trim(), base);
	if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return null;
	return url.href;
}

/** ISO-8601 duration (PT1H2M3S, P1DT2H) or plain seconds, to whole seconds. */
export function parseDuration(value: string | null | undefined): number | null {
	if (!value) return null;
	const text = value.trim();
	if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text));
	const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(text);
	if (!m || text === 'P' || text.toUpperCase() === 'PT') return null;
	const [, d, h, min, s] = m;
	const total =
		Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
	return Number.isFinite(total) ? Math.round(total) : null;
}

/** A date string to milliseconds since the epoch, or null. */
export function parseDate(value: unknown): number | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	const ms = Date.parse(value.trim());
	return Number.isFinite(ms) ? ms : null;
}

const LD_MAIN_TYPES = [
	'article',
	'newsarticle',
	'blogposting',
	'techarticle',
	'scholarlyarticle',
	'report',
	'videoobject',
	'podcastepisode',
	'audioobject',
	'socialmediaposting',
	'discussionforumposting',
	'webpage'
];

function ldTypes(object: Record<string, unknown>): string[] {
	const t = object['@type'];
	const list = Array.isArray(t) ? t : [t];
	return list.filter((x): x is string => typeof x === 'string').map((x) => x.toLowerCase());
}

/** The JSON-LD object that describes the page itself: the first of a known main type, else the first with a headline. */
function mainLd(objects: Record<string, unknown>[]): Record<string, unknown> | null {
	for (const type of LD_MAIN_TYPES) {
		const hit = objects.find((o) => ldTypes(o).includes(type));
		if (hit) return hit;
	}
	return objects.find((o) => typeof o.headline === 'string') ?? null;
}

function ldName(value: unknown): string | null {
	if (typeof value === 'string') return clean(value);
	if (Array.isArray(value)) return first(...value.map(ldName));
	if (value && typeof value === 'object') return clean((value as Record<string, unknown>).name);
	return null;
}

function ldUrl(value: unknown): string | null {
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return first(...value.map(ldUrl));
	if (value && typeof value === 'object') {
		const v = value as Record<string, unknown>;
		return ldUrl(v.url ?? v.contentUrl);
	}
	return null;
}

function sizeOf(sizes: string | null): number | null {
	if (!sizes) return null;
	if (/any/i.test(sizes)) return Infinity;
	const all = [...sizes.matchAll(/(\d+)x(\d+)/gi)].map((m) => Number(m[1]));
	return all.length ? Math.max(...all) : null;
}

/** The icon closest to 64 px: the smallest of 64 px or more, else SVG, else apple-touch, else the largest, else /favicon.ico. */
export function pickIcon(icons: HeadTags['icons'], base: string): string {
	let best: { href: string; score: number } | null = null;
	for (const icon of icons) {
		const href = absolute(icon.href, base);
		if (!href || icon.rel.includes('mask-icon')) continue;
		const size = sizeOf(icon.sizes);
		const svg = /svg/i.test(icon.type ?? '') || /\.svg(\?|$)/i.test(href);
		let score: number;
		if (size !== null && size !== Infinity && size >= 64) score = 10_000 - size;
		else if (svg || size === Infinity) score = 5_000;
		else if (icon.rel.includes('apple-touch-icon')) score = 4_000;
		else if (size !== null) score = 1_000 + size;
		else score = 500;
		if (!best || score > best.score) best = { href, score };
	}
	return best?.href ?? new URL('/favicon.ico', base).href;
}

/** The fields a head gives, before oEmbed. */
export function metaFromHead(
	tags: HeadTags,
	pageUrl: string
): Omit<PageMeta, 'finalUrl' | 'contentType' | 'oembedType'> {
	const m = (key: string) => tags.meta.get(key) ?? null;
	const ld = mainLd(tags.jsonLd);
	const authorMeta = m('author') ?? m('article:author');
	return {
		title: first(
			clean(m('og:title')),
			clean(m('twitter:title')),
			ld ? clean(ld.headline) : null,
			ld ? clean(ld.name) : null,
			clean(tags.title)
		),
		description: first(
			clean(m('og:description'), DESCRIPTION_MAX),
			clean(m('twitter:description'), DESCRIPTION_MAX),
			clean(m('description'), DESCRIPTION_MAX),
			ld ? clean(ld.description, DESCRIPTION_MAX) : null
		),
		siteName: first(clean(m('og:site_name')), ld ? ldName(ld.publisher) : null),
		author: first(
			authorMeta && !/^https?:\/\//i.test(authorMeta) ? clean(authorMeta) : null,
			ld ? ldName(ld.author) : null,
			ld ? ldName(ld.creator) : null
		),
		publishedAt: first(
			parseDate(m('article:published_time')),
			ld ? parseDate(ld.datePublished) : null,
			ld ? parseDate(ld.uploadDate) : null,
			parseDate(tags.itemprop.get('datePublished')),
			parseDate(tags.itemprop.get('uploadDate'))
		),
		durationS: first(
			parseDuration(m('og:video:duration')),
			parseDuration(m('video:duration')),
			ld ? parseDuration(typeof ld.duration === 'string' ? ld.duration : null) : null,
			parseDuration(tags.itemprop.get('duration'))
		),
		iconUrl: pickIcon(tags.icons, pageUrl),
		imageUrl: first(
			absolute(m('og:image:secure_url'), pageUrl),
			absolute(m('og:image'), pageUrl),
			absolute(m('og:image:url'), pageUrl),
			absolute(m('twitter:image'), pageUrl),
			absolute(m('twitter:image:src'), pageUrl),
			ld ? absolute(ldUrl(ld.image) ?? ldUrl(ld.thumbnailUrl), pageUrl) : null
		),
		ogType: clean(m('og:type'))?.toLowerCase() ?? null
	};
}

/** Reads an oEmbed JSON response. */
export function parseOEmbed(body: Buffer | string): OEmbed | null {
	let data: unknown;
	try {
		data = JSON.parse(typeof body === 'string' ? body : body.toString('utf-8'));
	} catch {
		return null;
	}
	if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
	const o = data as Record<string, unknown>;
	let text: string | null = null;
	if (typeof o.html === 'string') {
		const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(o.html)?.[1];
		if (p) {
			const tags = parseHead(
				`<title>${p.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')}</title>`
			);
			text = clean(tags.title, DESCRIPTION_MAX);
		}
	}
	return {
		type: clean(o.type)?.toLowerCase() ?? null,
		title: clean(o.title),
		authorName: clean(o.author_name),
		providerName: clean(o.provider_name),
		thumbnailUrl: typeof o.thumbnail_url === 'string' ? o.thumbnail_url : null,
		text
	};
}

/** YouTube links: a watch page, youtu.be, shorts, live or embed. */
export function isYouTubeVideo(url: URL): boolean {
	const host = url.hostname.replace(/^(www|m|music)\./, '');
	if (host === 'youtu.be') return url.pathname.length > 1;
	if (host !== 'youtube.com') return false;
	return (
		(url.pathname === '/watch' && url.searchParams.has('v')) ||
		/^\/(shorts|live|embed)\/[^/]+/.test(url.pathname)
	);
}

/** X (or Twitter) status links. */
export function isXStatus(url: URL): boolean {
	const host = url.hostname.replace(/^(www|mobile)\./, '');
	return (host === 'x.com' || host === 'twitter.com') && /^\/[^/]+\/status\/\d+/.test(url.pathname);
}

/** The oEmbed endpoint LinkSink knows for a link (YouTube, X), or null. */
export function knownOEmbedEndpoint(url: URL): string | null {
	if (isYouTubeVideo(url)) {
		return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.href)}`;
	}
	if (isXStatus(url)) {
		return `https://publish.x.com/oembed?omit_script=true&url=${encodeURIComponent(url.href)}`;
	}
	return null;
}

/** Merges what the head and oEmbed say. oEmbed wins the title, author and thumbnail; X's oEmbed only fills gaps. */
export function mergeMeta(
	head: ReturnType<typeof metaFromHead> | null,
	oembed: OEmbed | null,
	{ finalUrl, contentType, isX }: { finalUrl: string; contentType: string | null; isX: boolean }
): PageMeta {
	const h = head ?? {
		title: null,
		description: null,
		siteName: null,
		author: null,
		publishedAt: null,
		durationS: null,
		iconUrl: new URL('/favicon.ico', finalUrl).href,
		imageUrl: null,
		ogType: null
	};
	const o = oembed;
	const thumb = absolute(o?.thumbnailUrl, finalUrl);
	return {
		finalUrl,
		contentType,
		title: isX ? first(h.title, o?.title) : first(o?.title, h.title),
		description: first(h.description, o?.text),
		siteName: first(h.siteName, o?.providerName),
		author: isX ? first(o?.authorName, h.author) : first(o?.authorName, h.author),
		publishedAt: h.publishedAt,
		durationS: h.durationS,
		iconUrl: h.iconUrl,
		imageUrl: isX ? first(h.imageUrl, thumb) : first(thumb, h.imageUrl),
		ogType: h.ogType,
		oembedType: o?.type ?? null
	};
}

function isHtml(contentType: string | null): boolean {
	if (!contentType) return true; // no type given: try to read it as a page
	return /^\s*(text\/html|application\/xhtml\+xml)/i.test(contentType);
}

async function fetchOEmbed(safeFetch: SafeFetch, endpoint: string): Promise<OEmbed | null> {
	try {
		const response = await safeFetch({
			url: endpoint,
			accept: 'application/json',
			maxBytes: OEMBED_MAX_BYTES,
			overflow: 'fail'
		});
		if (response.status !== 200) return null;
		return parseOEmbed(response.body);
	} catch {
		return null; // oEmbed is a bonus; the page's own tags still count
	}
}

/**
 * Fetches a link's page (and its oEmbed, where there is one) through the guarded fetch and reads its details.
 * Throws FetchRefused or FetchFailed when the page cannot be read and no oEmbed answered either.
 */
export async function fetchMeta(safeFetch: SafeFetch, link: string): Promise<PageMeta> {
	const url = new URL(link);
	const known = knownOEmbedEndpoint(url);
	const [page, knownOEmbed] = await Promise.allSettled([
		safeFetch({
			url: link,
			accept: 'text/html',
			maxBytes: PAGE_MAX_BYTES,
			overflow: 'truncate',
			enough: headIsComplete
		}),
		known ? fetchOEmbed(safeFetch, known) : Promise.resolve(null)
	]);
	let oembed = knownOEmbed.status === 'fulfilled' ? knownOEmbed.value : null;

	if (page.status === 'rejected' || page.value.status >= 400) {
		if (oembed?.title) {
			return mergeMeta(null, oembed, {
				finalUrl: url.href,
				contentType: null,
				isX: isXStatus(url)
			});
		}
		if (page.status === 'rejected') throw page.reason;
		throw new FetchFailed('status', `the site answered ${page.value.status}`);
	}

	const response = page.value;
	let head: ReturnType<typeof metaFromHead> | null = null;
	if (isHtml(response.contentType)) {
		const tags = parseHead(decodeHtml(response.body, response.contentType));
		head = metaFromHead(tags, response.url);
		const discovered = absolute(tags.oembedHref, response.url);
		if (!oembed && discovered) oembed = await fetchOEmbed(safeFetch, discovered);
	}
	return mergeMeta(head, oembed, {
		finalUrl: response.url,
		contentType: response.contentType,
		isX: isXStatus(new URL(response.url)) || isXStatus(url)
	});
}
