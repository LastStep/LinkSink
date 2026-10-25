import { Parser } from 'htmlparser2';

/** What a page's `<head>` says about it, before any choice between sources is made. */
export interface HeadTags {
	/** `<meta property|name=...>` values by lower-cased key (og:title, twitter:title, description, author, ...); first wins. */
	meta: Map<string, string>;
	/** `<meta itemprop=...>` values (YouTube's duration, uploadDate); first wins. */
	itemprop: Map<string, string>;
	title: string | null;
	/** Parsed JSON-LD objects, flattened out of arrays and `@graph`. */
	jsonLd: Record<string, unknown>[];
	icons: { href: string; rel: string; sizes: string | null; type: string | null }[];
	/** `<link rel=alternate type=application/json+oembed href=...>`. */
	oembedHref: string | null;
}

/** True once the bytes so far hold the end of the head (or the start of the body), so reading can stop. */
export function headIsComplete(bytes: Buffer): boolean {
	const text = bytes.toString('latin1').toLowerCase();
	return text.includes('</head') || text.includes('<body');
}

const BOMS: [number[], string][] = [
	[[0xef, 0xbb, 0xbf], 'utf-8'],
	[[0xfe, 0xff], 'utf-16be'],
	[[0xff, 0xfe], 'utf-16le']
];

function decoderFor(label: string | null | undefined): TextDecoder | null {
	if (!label) return null;
	try {
		return new TextDecoder(label.trim().replace(/^["']|["']$/g, ''));
	} catch {
		return null; // an unknown label: try the next source
	}
}

/**
 * Decodes a page: a byte-order mark, else the Content-Type header's charset, else a `<meta charset>` (or
 * http-equiv) in the first 1024 bytes, else UTF-8. An unknown label is skipped, never fatal; bytes that do not fit
 * the charset become U+FFFD.
 */
export function decodeHtml(body: Buffer, contentType: string | null): string {
	for (const [bom, label] of BOMS) {
		if (bom.every((b, i) => body[i] === b)) return new TextDecoder(label).decode(body);
	}
	const fromHeader = /charset\s*=\s*("?)([^";\s]+)\1/i.exec(contentType ?? '')?.[2];
	const sniff = body.subarray(0, 1024).toString('latin1');
	const fromMeta =
		/<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(sniff)?.[1] ??
		/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([\w.:-]+)/i.exec(sniff)?.[1];
	const decoder = decoderFor(fromHeader) ?? decoderFor(fromMeta) ?? new TextDecoder('utf-8');
	if (decoder.encoding === 'windows-1252') return decodeWindows1252(body);
	return decoder.decode(body);
}

// Node 22's TextDecoder decodes windows-1252 (and the labels WHATWG maps to it: latin1, iso-8859-1, ascii) as
// ISO-8859-1, turning 0x80-0x9F into control characters instead of € “ ” and the rest. This is the WHATWG table.
const CP1252 =
	'\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f' +
	'\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178';

function decodeWindows1252(body: Buffer): string {
	let out = '';
	for (let i = 0; i < body.length; i += 8192) {
		const chunk = body.subarray(i, i + 8192);
		// eslint-disable-next-line no-restricted-syntax -- bounded: each chunk is at most 8,192 bytes (the loop above)
		out += String.fromCharCode(...chunk.map((b) => b)).replace(/[\x80-\x9f]/g, (c) =>
			CP1252.charAt(c.charCodeAt(0) - 0x80)
		);
	}
	return out;
}

function flattenJsonLd(value: unknown, out: Record<string, unknown>[], depth = 0) {
	if (depth > 4 || !value || typeof value !== 'object') return;
	if (Array.isArray(value)) {
		for (const item of value) flattenJsonLd(item, out, depth + 1);
		return;
	}
	const object = value as Record<string, unknown>;
	out.push(object);
	if (Array.isArray(object['@graph'])) flattenJsonLd(object['@graph'], out, depth + 1);
}

/** Reads the head of an HTML document; stops at `</head>` or `<body>`. Script text never ends the head. */
export function parseHead(html: string): HeadTags {
	const tags: HeadTags = {
		meta: new Map(),
		itemprop: new Map(),
		title: null,
		jsonLd: [],
		icons: [],
		oembedHref: null
	};
	let done = false;
	let inTitle = false;
	let titleText = '';
	let jsonLdText: string | null = null;

	const parser = new Parser(
		{
			onopentag(name, attrs) {
				if (done) return;
				if (name === 'body') {
					done = true;
					return;
				}
				if (name === 'title' && tags.title === null) {
					inTitle = true;
					titleText = '';
				} else if (name === 'script' && /ld\+json/i.test(attrs.type ?? '')) {
					jsonLdText = '';
				} else if (name === 'meta') {
					const content = attrs.content;
					if (content === undefined) return;
					const key = (attrs.property ?? attrs.name ?? '').trim().toLowerCase();
					if (key && !tags.meta.has(key)) tags.meta.set(key, content);
					const prop = attrs.itemprop?.trim();
					if (prop && !tags.itemprop.has(prop)) tags.itemprop.set(prop, content);
				} else if (name === 'link' && attrs.href) {
					const rel = (attrs.rel ?? '').toLowerCase().split(/\s+/).filter(Boolean);
					if (rel.includes('icon') || rel.includes('apple-touch-icon')) {
						tags.icons.push({
							href: attrs.href,
							rel: rel.join(' '),
							sizes: attrs.sizes ?? null,
							type: attrs.type ?? null
						});
					}
					if (
						rel.includes('alternate') &&
						/application\/json\+oembed/i.test(attrs.type ?? '') &&
						!tags.oembedHref
					) {
						tags.oembedHref = attrs.href;
					}
				}
			},
			ontext(text) {
				if (done) return;
				if (inTitle) titleText += text;
				else if (jsonLdText !== null) jsonLdText += text;
			},
			onclosetag(name) {
				if (done) return;
				if (name === 'head') done = true;
				else if (name === 'title' && inTitle) {
					inTitle = false;
					tags.title = titleText;
				} else if (name === 'script' && jsonLdText !== null) {
					try {
						flattenJsonLd(JSON.parse(jsonLdText), tags.jsonLd);
					} catch {
						// a broken JSON-LD block is ignored
					}
					jsonLdText = null;
				}
			}
		},
		{ decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true }
	);
	parser.end(html);
	return tags;
}
