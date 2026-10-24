// What counts as "the same address" (F-web-mvp, "A link is saved once per address"), shared by server and client.

/** Query parameters that only track where a click came from, removed everywhere. `utm_*` is matched by prefix. */
const TRACKERS = new Set([
	'fbclid',
	'gclid',
	'dclid',
	'msclkid',
	'mc_cid',
	'mc_eid',
	'igshid',
	'ref_src'
]);

/** Hosts whose `si` parameter is a share tracker (elsewhere `si` can mean something, so it stays). */
const SI_HOSTS = ['youtu.be', 'youtube.com', 'spotify.com'];

function hostIs(host: string, suffix: string) {
	return host === suffix || host.endsWith(`.${suffix}`);
}

function isTracker(name: string, host: string) {
	const key = name.toLowerCase();
	if (key.startsWith('utm_') || TRACKERS.has(key)) return true;
	return key === 'si' && SI_HOSTS.some((h) => hostIs(host, h));
}

/** Parses an http(s) address, or returns null for anything else (other schemes, junk). */
export function parseHttpUrl(input: string): URL | null {
	const url = URL.parse(input.trim());
	if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return null;
	return url;
}

function withoutTrackers(url: URL): URL {
	const out = new URL(url.href);
	const host = out.hostname.toLowerCase();
	const trackers = [...new Set(out.searchParams.keys())].filter((name) => isTracker(name, host));
	// Untouched unless there is a tracker: rewriting the query would re-encode it.
	if (trackers.length === 0) return out;
	for (const name of trackers) out.searchParams.delete(name);
	// `?` with nothing after it is not part of the address.
	if (out.searchParams.size === 0) out.search = '';
	return out;
}

/**
 * The address as it is kept: what was given, with tracking parameters removed and nothing else changed (fragment,
 * `www.` and parameter order stay, so the link still opens where it pointed). Null if it is not an http(s) link.
 */
export function cleanUrl(input: string): string | null {
	const url = parseHttpUrl(input);
	return url ? withoutTrackers(url).href : null;
}

/**
 * The key two addresses share when they are the same link: trackers removed (`utm_*`, `fbclid`, `gclid`, `dclid`,
 * `msclkid`, `mc_cid`, `mc_eid`, `igshid`, `ref_src`; `si` on YouTube and Spotify), the fragment, a leading `www.`,
 * a trailing slash and a default port dropped, the remaining query parameters sorted by name (YouTube's `v`, `t`
 * and `list` are ordinary parameters, so they stay). The scheme is left out: `http://` and `https://` of one
 * address are one link (the person, 2026-10-24). The host is lower-cased by the URL parser; the path's case is
 * kept. Null if it is not an http(s) link.
 */
export function normalise(input: string): string | null {
	const parsed = parseHttpUrl(input);
	if (!parsed) return null;
	const url = withoutTrackers(parsed);
	const host = url.hostname
		.toLowerCase()
		.replace(/\.$/, '')
		.replace(/^www\./, '');
	// The URL parser already drops 80 on http and 443 on https.
	const port = url.port ? `:${url.port}` : '';
	const path = url.pathname.replace(/\/+$/, '');
	url.searchParams.sort();
	const query = url.searchParams.size ? `?${url.searchParams}` : '';
	return `${host}${port}${path}${query}`;
}

/** The host a person recognises: lower-case, without `www.`. Used as a new link's title until its page is read. */
export function displayHost(input: string): string {
	const url = parseHttpUrl(input);
	return url ? url.hostname.replace(/^www\./, '') : input;
}

/**
 * The first http(s) address in pasted text, or null. Trailing punctuation that ends a sentence is not part of it,
 * and a closing bracket only when the address opened none.
 */
export function firstHttpUrl(text: string): string | null {
	const match = text.match(/https?:\/\/[^\s<>"'`]+/i);
	if (!match) return null;
	let url = match[0];
	for (;;) {
		const last = url.at(-1)!;
		if ('.,;:!?'.includes(last)) url = url.slice(0, -1);
		else if (last === ')' && count(url, '(') < count(url, ')')) url = url.slice(0, -1);
		else if (last === ']' && count(url, '[') < count(url, ']')) url = url.slice(0, -1);
		else break;
	}
	return parseHttpUrl(url) ? url : null;
}

function count(text: string, ch: string) {
	return text.split(ch).length - 1;
}
