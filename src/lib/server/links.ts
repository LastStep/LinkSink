import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DB } from './db/open.ts';
import { links } from './db/schema.ts';
import type { SyncWrite } from './sync/write.ts';
import { ulid } from './ulid.ts';

export type Link = typeof links.$inferSelect;

/**
 * Turns what a person typed into an FTS5 query: each word quoted (so no FTS5 syntax gets through) and matched as a
 * prefix, all words required. Returns null when nothing searchable is left.
 */
export function toFtsQuery(input: string): string | null {
	const words = input
		.normalize('NFKC')
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean)
		.slice(0, 16);
	if (words.length === 0) return null;
	return words.map((w) => `"${w.replaceAll('"', '""')}"*`).join(' ');
}

/** The user's live links, newest first; with `q`, only those matching it in the full-text index, best first. */
export function listLinks(db: DB, userId: string, q?: string | null, limit = 200): Link[] {
	const live = and(eq(links.userId, userId), isNull(links.deletedAt));
	const match = q ? toFtsQuery(q) : null;
	if (!match) {
		return db
			.select()
			.from(links)
			.where(live)
			.orderBy(desc(links.createdAt), desc(links.id))
			.limit(limit)
			.all();
	}
	return db
		.select()
		.from(links)
		.where(
			and(
				live,
				sql`${links}.rowid IN (SELECT rowid FROM links_fts WHERE links_fts MATCH ${match} ORDER BY rank LIMIT ${limit})`
			)
		)
		.orderBy(desc(links.createdAt), desc(links.id))
		.all();
}

/** A link the person typed that cannot be saved; its message is safe to show them. */
export class InvalidLinkError extends Error {}

/**
 * What the person sees when a save fails: known causes in plain words. Anything else is logged on the server and
 * shown only as a generic line, so no internal detail reaches the page.
 */
export function saveErrorMessage(
	error: unknown,
	log: (...args: unknown[]) => void = console.error
): string {
	if (error instanceof InvalidLinkError) return error.message;
	const text = error instanceof Error ? error.message : '';
	if (text.includes('UNIQUE constraint failed: links.user_id, links.url_key'))
		return 'That link is already saved.';
	log('[links] save failed', error);
	return 'Something went wrong saving that link. Try again.';
}

/**
 * Saves one link through syncWrite. A placeholder until T-0006: `url_key` is the parsed URL's href (T-0006 brings
 * the real `normalise()`), and a URL already saved is refused by the live-row unique index.
 */
export function addLink(
	syncWrite: SyncWrite,
	userId: string,
	input: { url: string; title?: string | null }
): string {
	const parsed = URL.parse(input.url.trim());
	if (!parsed) throw new InvalidLinkError('That is not a link.');
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new InvalidLinkError('Only http and https links can be saved.');
	}
	const id = ulid();
	syncWrite(userId, (w) => {
		w.insert(links, {
			id,
			url: parsed.href,
			urlKey: parsed.href,
			title: input.title?.trim() || null,
			savedVia: 'paste'
		});
	});
	return id;
}
