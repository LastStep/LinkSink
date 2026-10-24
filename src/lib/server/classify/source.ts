import { and, eq, isNull } from 'drizzle-orm';
import { getDomain } from 'tldts';
import { sources } from '../db/schema.ts';
import type { SyncWriter } from '../sync/write.ts';
import { ulid } from '../ulid.ts';

/** The sources every person starts with (P-T-0002, step 5), as host suffixes. */
export const SEED_SOURCES: readonly { name: string; hosts: readonly string[] }[] = [
	{ name: 'YouTube', hosts: ['youtube.com', 'youtu.be', 'm.youtube.com'] },
	{ name: 'GitHub', hosts: ['github.com'] },
	{ name: 'X', hosts: ['x.com', 'twitter.com'] },
	{ name: 'Reddit', hosts: ['reddit.com'] },
	{ name: 'Hacker News', hosts: ['news.ycombinator.com'] },
	{ name: 'Medium', hosts: ['medium.com'] },
	{ name: 'Substack', hosts: ['substack.com'] },
	{ name: 'Vimeo', hosts: ['vimeo.com'] },
	{ name: 'Spotify', hosts: ['spotify.com'] },
	{ name: 'Wikipedia', hosts: ['wikipedia.org'] },
	{ name: 'arXiv', hosts: ['arxiv.org'] },
	{ name: 'Stack Overflow', hosts: ['stackoverflow.com'] },
	{ name: 'LinkedIn', hosts: ['linkedin.com'] },
	{ name: 'Instagram', hosts: ['instagram.com'] }
];

export interface SourceRow {
	id: string;
	name: string;
	hosts: string[];
}

export function normaliseHost(host: string): string {
	return host.trim().toLowerCase().replace(/\.+$/, '').replace(/^\*\./, '');
}

/** True when `host` is `suffix` or a subdomain of it (so `box.com` never matches `x.com`). */
export function hostMatches(host: string, suffix: string): boolean {
	const h = normaliseHost(host);
	const s = normaliseHost(suffix);
	return s.length > 0 && (h === s || h.endsWith(`.${s}`));
}

/** The source whose longest host suffix the host ends with, or null. */
export function matchSource(host: string, rows: readonly SourceRow[]): SourceRow | null {
	let best: { row: SourceRow; length: number } | null = null;
	for (const row of rows) {
		for (const suffix of row.hosts) {
			const length = normaliseHost(suffix).length;
			if (hostMatches(host, suffix) && (!best || length > best.length)) best = { row, length };
		}
	}
	return best?.row ?? null;
}

/** The registrable domain (news.bbc.co.uk → bbc.co.uk), or the host itself for an IP or an unknown suffix. */
export function registrableDomain(host: string): string {
	const h = normaliseHost(host);
	return getDomain(h, { allowPrivateDomains: true }) ?? h;
}

function parseHosts(json: string): string[] {
	try {
		const value = JSON.parse(json);
		return Array.isArray(value) ? value.filter((h): h is string => typeof h === 'string') : [];
	} catch {
		return [];
	}
}

/** The person's live sources. */
export function liveSources(w: SyncWriter): SourceRow[] {
	return w.tx
		.select({ id: sources.id, name: sources.name, hosts: sources.hosts })
		.from(sources)
		.where(and(eq(sources.userId, w.userId), isNull(sources.deletedAt)))
		.all()
		.map((r) => ({ ...r, hosts: parseHosts(r.hosts) }));
}

/**
 * Seeds the person's sources the first time any are needed: only when they have never had one (a person who
 * deletes every source is not given them back). Inside the caller's syncWrite.
 */
export function ensureSeedSources(w: SyncWriter): void {
	const any = w.tx
		.select({ id: sources.id })
		.from(sources)
		.where(eq(sources.userId, w.userId))
		.limit(1)
		.all();
	if (any.length) return;
	for (const seed of SEED_SOURCES) {
		w.insert(sources, { id: ulid(), name: seed.name, hosts: JSON.stringify(seed.hosts) });
	}
}

/**
 * The source of a link, inside the caller's syncWrite: the source with the longest host suffix matching the final
 * URL's host; else a source named after og:site_name (an existing one of that name gains this domain); else one
 * named after the registrable domain. Returns its id.
 */
export function resolveSource(w: SyncWriter, finalUrl: string, siteName: string | null): string {
	ensureSeedSources(w);
	const host = normaliseHost(new URL(finalUrl).hostname.replace(/^\[|\]$/g, ''));
	const rows = liveSources(w);
	const matched = matchSource(host, rows);
	if (matched) return matched.id;

	const domain = registrableDomain(host);
	const name = siteName?.trim() || domain;
	const named = rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
	if (named) {
		w.update(sources, eq(sources.id, named.id), {
			hosts: JSON.stringify([...named.hosts, domain])
		});
		return named.id;
	}
	const id = ulid();
	w.insert(sources, { id, name, hosts: JSON.stringify([domain]) });
	return id;
}
