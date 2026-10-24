import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { MEDIA, PRIORITIES, STATUSES, type SavedVia, type UserSetField } from '../fields.ts';
import type { LinkJson, View } from '../store/types.ts';
import { ULID_PATTERN } from '../ulid.ts';
import { cleanUrl, displayHost, normalise } from '../url.ts';
import type { DB } from './db/open.ts';
import { linkProjects, links, linkTags, sources } from './db/schema.ts';
import { organisingOf, setOrganising, unsortedSql } from './organise.ts';
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

/** The SQL condition for the links a view shows (archived links only in Archive). */
function viewSql(view: View) {
	switch (view.kind) {
		case 'archive':
			return isNotNull(links.archivedAt);
		case 'unsorted':
			return and(isNull(links.archivedAt), unsortedSql);
		case 'project':
			return and(
				isNull(links.archivedAt),
				sql`EXISTS (SELECT 1 FROM ${linkProjects} lp WHERE lp.link_id = "links"."id" AND lp.project_id = ${view.id} AND lp.deleted_at IS NULL)`
			);
		case 'tag':
			return and(
				isNull(links.archivedAt),
				sql`EXISTS (SELECT 1 FROM ${linkTags} lt WHERE lt.link_id = "links"."id" AND lt.tag_id = ${view.id} AND lt.deleted_at IS NULL)`
			);
		default:
			return isNull(links.archivedAt);
	}
}

/** Reads a view from a list request's query: `view=unsorted|archive`, `project=<id>` or `tag=<id>`. */
export function parseView(params: URLSearchParams): View {
	const project = params.get('project');
	if (project) return { kind: 'project', id: project };
	const tag = params.get('tag');
	if (tag) return { kind: 'tag', id: tag };
	const view = params.get('view');
	if (view === 'unsorted' || view === 'archive') return { kind: view };
	return { kind: 'all' };
}

/**
 * The user's live links in a view (every unarchived link by default), newest first; with `q`, only those matching
 * it in the full-text index.
 */
export function listLinks(
	db: DB,
	userId: string,
	q?: string | null,
	limit = 200,
	view: View = { kind: 'all' }
): Link[] {
	const live = and(eq(links.userId, userId), isNull(links.deletedAt), viewSql(view));
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

const TITLE_MAX = 500;
const DESCRIPTION_MAX = 5_000;
const NOTES_MAX = 20_000;

/** The user's link by id, live or deleted; null if it is not theirs. */
export function getLink(db: DB, userId: string, id: string): Link | null {
	return (
		db
			.select()
			.from(links)
			.where(and(eq(links.id, id), eq(links.userId, userId)))
			.get() ?? null
	);
}

/** The user's live link with this url_key, if any. */
export function findByKey(db: DB, userId: string, urlKey: string): Link | null {
	return (
		db
			.select()
			.from(links)
			.where(and(eq(links.userId, userId), eq(links.urlKey, urlKey), isNull(links.deletedAt)))
			.get() ?? null
	);
}

export interface NewLink {
	url: string;
	/** A title the person typed; empty or missing means "the hostname until the page is read". */
	title?: string | null;
	/** An id the device made (a ULID), so its optimistic row keeps its id; ignored if malformed or taken. */
	id?: string | null;
	via?: SavedVia;
	/** Tags and projects (by id) the link joins in the same write that creates it. Must be the user's live ones. */
	tagIds?: string[];
	projectIds?: string[];
}

function isUnique(error: unknown) {
	return (
		error instanceof Error &&
		error.message.includes('UNIQUE constraint failed: links.user_id, links.url_key')
	);
}

/**
 * Inserts one link through syncWrite: the address kept with trackers removed, its `url_key` from `normalise()`, the
 * title the person typed (then marked as theirs in `user_set`) or else the hostname, `meta_state` pending. A URL
 * already saved is refused by the live-row unique index (`saveLink` turns that into a duplicate answer).
 */
export function addLink(syncWrite: SyncWrite, userId: string, input: NewLink): string {
	const urlKey = normalise(input.url);
	const url = cleanUrl(input.url);
	if (!urlKey || !url) {
		throw new InvalidLinkError(
			URL.canParse(input.url.trim())
				? 'Only http and https links can be saved.'
				: 'That is not a link.'
		);
	}
	const typed = input.title?.trim().slice(0, TITLE_MAX) || null;
	const wanted = input.id && ULID_PATTERN.test(input.id) ? input.id : null;
	return syncWrite(userId, (w) => {
		const taken =
			wanted && w.tx.select({ id: links.id }).from(links).where(eq(links.id, wanted)).get();
		const id = wanted && !taken ? wanted : ulid(w.now);
		w.insert(links, {
			id,
			url,
			urlKey,
			title: typed ?? displayHost(url),
			userSet: JSON.stringify(typed ? ['title'] : []),
			metaState: 'pending',
			savedVia: input.via ?? 'paste'
		});
		if (input.tagIds?.length || input.projectIds?.length) {
			setOrganising(w, id, { tagIds: input.tagIds, projectIds: input.projectIds });
		}
		return id;
	});
}

/**
 * Saves a link unless its address is already saved: then nothing is written and the existing link comes back with
 * `duplicate: true` (F-web-mvp, "saved once per address").
 */
export function saveLink(
	db: DB,
	syncWrite: SyncWrite,
	userId: string,
	input: NewLink
): { link: Link; duplicate: boolean } {
	const key = normalise(input.url);
	const existing = key ? findByKey(db, userId, key) : null;
	if (existing)
		return { link: joinExisting(db, syncWrite, userId, existing, input), duplicate: true };
	try {
		const id = addLink(syncWrite, userId, input);
		return { link: getLink(db, userId, id)!, duplicate: false };
	} catch (error) {
		// Saved by another request between the look-up and the insert.
		const raced = key && isUnique(error) ? findByKey(db, userId, key) : null;
		if (raced) return { link: joinExisting(db, syncWrite, userId, raced, input), duplicate: true };
		throw error;
	}
}

/** A duplicate paste on a tag's or project's page adds that tag or project to the link already saved. */
function joinExisting(
	db: DB,
	syncWrite: SyncWrite,
	userId: string,
	link: Link,
	input: NewLink
): Link {
	if (!input.tagIds?.length && !input.projectIds?.length) return link;
	const org = organisingOf(db, userId, [link.id]).get(link.id) ?? { tagIds: [], projectIds: [] };
	const union = (have: string[], add: string[] | undefined) => [
		...new Set([...have, ...(add ?? [])])
	];
	return (
		patchLink(db, syncWrite, userId, link.id, {
			tagIds: union(org.tagIds, input.tagIds),
			projectIds: union(org.projectIds, input.projectIds)
		}) ?? link
	);
}

/** What a PATCH may change. `archived` sets or clears `archived_at`. */
export interface LinkPatch {
	title?: string | null;
	description?: string | null;
	notes?: string | null;
	sourceId?: string | null;
	media?: string;
	status?: string | null;
	priority?: number | null;
	archived?: boolean;
	/** The whole set of the link's tags, by id. */
	tagIds?: string[];
	/** The whole set of the link's projects, by id. */
	projectIds?: string[];
}

/** A request the person (or a client) got wrong; its message is safe to send back. */
export class BadPatchError extends Error {}

function text(value: unknown, field: string, max: number): string | null {
	if (value === null) return null;
	if (typeof value !== 'string') throw new BadPatchError(`${field} must be text or null.`);
	if (value.length > max) throw new BadPatchError(`${field} is longer than ${max} characters.`);
	return value;
}

/** Checks a PATCH body field by field; unknown fields are refused rather than ignored. */
export function parsePatch(body: unknown): LinkPatch {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		throw new BadPatchError('Send a JSON object.');
	}
	const patch: LinkPatch = {};
	for (const [field, value] of Object.entries(body)) {
		switch (field) {
			case 'title': {
				const title = text(value, field, TITLE_MAX)?.trim();
				if (!title) throw new BadPatchError('title cannot be empty.');
				patch.title = title;
				break;
			}
			case 'description':
				patch.description = text(value, field, DESCRIPTION_MAX);
				break;
			case 'notes':
				patch.notes = text(value, field, NOTES_MAX);
				break;
			case 'sourceId':
				patch.sourceId = text(value, field, 64);
				break;
			case 'media':
				if (!MEDIA.includes(value as never)) {
					throw new BadPatchError(`media must be one of ${MEDIA.join(', ')}.`);
				}
				patch.media = value as string;
				break;
			case 'status':
				if (value !== null && !STATUSES.includes(value as never)) {
					throw new BadPatchError(`status must be null or one of ${STATUSES.join(', ')}.`);
				}
				patch.status = value as string | null;
				break;
			case 'priority':
				if (value !== null && !PRIORITIES.includes(value as never)) {
					throw new BadPatchError('priority must be null, 1, 2 or 3.');
				}
				patch.priority = value as number | null;
				break;
			case 'archived':
				if (typeof value !== 'boolean') throw new BadPatchError('archived must be true or false.');
				patch.archived = value;
				break;
			case 'tagIds':
			case 'projectIds':
				if (
					!Array.isArray(value) ||
					value.length > 200 ||
					value.some((v) => typeof v !== 'string' || v.length > 64)
				) {
					throw new BadPatchError(`${field} must be a list of ids.`);
				}
				patch[field] = [...new Set(value as string[])];
				break;
			default:
				throw new BadPatchError(`${field} cannot be changed.`);
		}
	}
	return patch;
}

/** The `user_set` name of each hand-editable column. */
const USER_SET: Partial<Record<keyof LinkPatch, UserSetField>> = {
	title: 'title',
	description: 'description',
	sourceId: 'source',
	media: 'media'
};

/**
 * Applies a checked patch to the user's live link through syncWrite, and adds each of title, description, source
 * and media whose value it changes to the link's `user_set`, so the metadata fetcher never overwrites it. Returns
 * the link after the write, the same link untouched when nothing changes, or null if there is no such live link.
 */
export function patchLink(
	db: DB,
	syncWrite: SyncWrite,
	userId: string,
	id: string,
	patch: LinkPatch
): Link | null {
	const link = getLink(db, userId, id);
	if (!link || link.deletedAt !== null) return null;
	if (typeof patch.sourceId === 'string') {
		// links.source_id references sources (T-0007): a source that is not the person's live one is a bad request.
		const source = db
			.select({ id: sources.id })
			.from(sources)
			.where(
				and(eq(sources.id, patch.sourceId), eq(sources.userId, userId), isNull(sources.deletedAt))
			)
			.get();
		if (!source) throw new BadPatchError('No such source.');
	}

	const set: Partial<typeof links.$inferInsert> = {};
	const userSet = new Set<string>(JSON.parse(link.userSet) as string[]);
	const { tagIds, projectIds, ...fields } = patch;
	for (const [field, value] of Object.entries(fields) as [keyof LinkPatch, unknown][]) {
		if (field === 'archived') {
			if ((link.archivedAt !== null) !== value) set.archivedAt = value ? Date.now() : null;
			continue;
		}
		if (link[field as keyof Link] === value) continue;
		(set as Record<string, unknown>)[field] = value;
		const mark = USER_SET[field];
		if (mark) userSet.add(mark);
	}
	const joins = tagIds !== undefined || projectIds !== undefined;
	if (Object.keys(set).length === 0 && !joins) return link;
	if (Object.keys(set).length) set.userSet = JSON.stringify([...userSet]);

	syncWrite(userId, (w) => {
		if (set.archivedAt) set.archivedAt = w.now;
		if (Object.keys(set).length) {
			w.update(links, and(eq(links.id, id), isNull(links.deletedAt))!, set);
		}
		if (joins) setOrganising(w, id, { tagIds, projectIds });
	});
	return getLink(db, userId, id);
}

/** Soft-deletes the user's live link (the row stays as a tombstone, ADR-0001). False if there was none. */
export function deleteLink(syncWrite: SyncWrite, userId: string, id: string): boolean {
	return syncWrite(userId, (w) => w.softDelete(links, eq(links.id, id))) > 0;
}

/** Why a deleted link could not come back. */
export class RestoreConflictError extends Error {}

/**
 * Brings a soft-deleted link back (the undo after a delete) through syncWrite. Null if the user has no such
 * deleted link; a `RestoreConflictError` if the same address was saved again since.
 */
export function restoreLink(db: DB, syncWrite: SyncWrite, userId: string, id: string): Link | null {
	const link = getLink(db, userId, id);
	if (!link) return null;
	if (link.deletedAt === null) return link;
	if (findByKey(db, userId, link.urlKey)) {
		throw new RestoreConflictError('That address was saved again after it was deleted.');
	}
	syncWrite(userId, (w) =>
		w.update(links, and(eq(links.id, id), isNotNull(links.deletedAt))!, { deletedAt: null })
	);
	return getLink(db, userId, id);
}

/** The links as the API sends them: every column but the owner, with their tag and project ids. */
export function linksJson(db: DB, userId: string, rows: Link[]): LinkJson[] {
	const org = organisingOf(
		db,
		userId,
		rows.map((l) => l.id)
	);
	return rows.map((link) => {
		const { userId: owner, userSet, ...rest } = link;
		void owner;
		return {
			...rest,
			userSet: JSON.parse(userSet) as LinkJson['userSet'],
			...(org.get(link.id) ?? { tagIds: [], projectIds: [] })
		};
	});
}

/** One link as the API sends it. */
export function linkJson(db: DB, link: Link): LinkJson {
	return linksJson(db, link.userId, [link])[0];
}
