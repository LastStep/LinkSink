// The list query (plan P-T-0002, step 7): one SQL query for a view, its search, its filters and its sort, paged by
// keyset. The rules are the shared ones in src/lib/search/ (the client checks a link it holds by the same rules).
import { and, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { PRIORITY_OF, statusRank, type Filters, type Sort } from '../search/filters.ts';
import { parseQuery, toFts } from '../search/query.ts';
import type { View } from '../store/types.ts';
import type { DB } from './db/open.ts';
import { links } from './db/schema.ts';
import { unsortedSql } from './organise.ts';

export type Link = typeof links.$inferSelect;

/** Rows per page. */
export const PAGE_SIZE = 50;
/** The most a caller may ask for in one page (`limit`). */
export const PAGE_MAX = 200;

const tagged = (ids: SQL) =>
	sql`EXISTS (SELECT 1 FROM link_tags lt WHERE lt.link_id = "links"."id" AND lt.tag_id IN ${ids} AND lt.deleted_at IS NULL)`;
const inProject = (ids: SQL) =>
	sql`EXISTS (SELECT 1 FROM link_projects lp WHERE lp.link_id = "links"."id" AND lp.project_id IN ${ids} AND lp.deleted_at IS NULL)`;
const ids = (values: string[]) =>
	sql`(${sql.join(
		values.map((v) => sql`${v}`),
		sql`, `
	)})`;

/** Which links a view holds, archived or not (the archive rule is the filters'). */
function viewSql(view: View): SQL | undefined {
	switch (view.kind) {
		case 'unsorted':
			return unsortedSql;
		case 'project':
			return inProject(ids([view.id]));
		case 'tag':
			return tagged(ids([view.id]));
		default:
			return undefined;
	}
}

/** Archive is archived links only; every other view follows `archived` (left out unless include or only). */
function archivedSql(view: View, f: Filters): SQL | undefined {
	const mode = view.kind === 'archive' ? 'only' : f.archived;
	if (mode === 'only') return isNotNull(links.archivedAt);
	if (mode === 'exclude') return isNull(links.archivedAt);
	return undefined;
}

/** A filter over a nullable fixed-value column: any of the picked values, `null` meaning "not set". */
function anyOf(column: SQL | typeof links.status, values: (string | number | null)[]): SQL {
	const set = values.filter((v) => v !== null);
	const parts: SQL[] = [];
	if (set.length) parts.push(sql`${column} IN ${ids(set.map(String))}`);
	if (values.includes(null)) parts.push(sql`${column} IS NULL`);
	return sql`(${sql.join(parts, sql` OR `)})`;
}

/**
 * The WHERE clause for one user's list: live links, the view, the archive rule, each filter (any within one, all
 * across, every tag with `tagMode` all) and the search, matched in links_fts.
 */
export function filterSql(userId: string, view: View, f: Filters): SQL {
	const parts: (SQL | undefined)[] = [
		eq(links.userId, userId),
		isNull(links.deletedAt),
		viewSql(view),
		archivedSql(view, f)
	];
	if (f.source.length) parts.push(sql`${links.sourceId} IN ${ids(f.source)}`);
	if (f.media.length) parts.push(sql`${links.media} IN ${ids(f.media)}`);
	if (f.tags.length) {
		parts.push(
			f.tagMode === 'all' ? and(...f.tags.map((t) => tagged(ids([t])))) : tagged(ids(f.tags))
		);
	}
	if (f.projects.length) parts.push(inProject(ids(f.projects)));
	if (f.status.length) {
		parts.push(
			anyOf(
				links.status,
				f.status.map((s) => (s === 'none' ? null : s))
			)
		);
	}
	if (f.priority.length) {
		// priority is an integer column: compare numbers, not text
		const set = f.priority.map((p) => PRIORITY_OF[p]);
		const nums = set.filter((p) => p !== null);
		const ors: SQL[] = [];
		if (nums.length)
			ors.push(
				sql`${links.priority} IN (${sql.join(
					nums.map((n) => sql`${n}`),
					sql`, `
				)})`
			);
		if (set.includes(null)) ors.push(sql`${links.priority} IS NULL`);
		parts.push(sql`(${sql.join(ors, sql` OR `)})`);
	}
	const match = toFts(parseQuery(f.q));
	if (match) {
		parts.push(sql`"links".rowid IN (SELECT rowid FROM links_fts WHERE links_fts MATCH ${match})`);
	}
	return and(...parts)!;
}

/** The columns a sort orders by, in order, and its direction (one direction for every column, so keyset works). */
function sortKey(sort: Sort): {
	columns: SQL[];
	desc: boolean;
	of: (l: Link) => (string | number)[];
} {
	switch (sort) {
		case 'opened':
			return {
				columns: [
					sql`coalesce("links"."opened_at", 0)`,
					sql`"links"."created_at"`,
					sql`"links"."id"`
				],
				desc: true,
				of: (l) => [l.openedAt ?? 0, l.createdAt, l.id]
			};
		case 'status':
			return {
				columns: [
					sql`CASE "links"."status" WHEN 'to_read' THEN 3 WHEN 'in_progress' THEN 2 WHEN 'done' THEN 1 ELSE 0 END`,
					sql`"links"."created_at"`,
					sql`"links"."id"`
				],
				desc: true,
				of: (l) => [statusRank(l.status), l.createdAt, l.id]
			};
		case 'edited':
			return {
				columns: [sql`"links"."updated_at"`, sql`"links"."id"`],
				desc: true,
				of: (l) => [l.updatedAt, l.id]
			};
		case 'priority':
			return {
				columns: [
					sql`coalesce("links"."priority", 0)`,
					sql`"links"."created_at"`,
					sql`"links"."id"`
				],
				desc: true,
				of: (l) => [l.priority ?? 0, l.createdAt, l.id]
			};
		case 'title':
			return {
				columns: [
					sql`lower(coalesce(nullif("links"."title", ''), "links"."url"))`,
					sql`"links"."id"`
				],
				desc: false,
				of: (l) => [(l.title || l.url).replace(/[A-Z]/g, (c) => c.toLowerCase()), l.id]
			};
		default:
			return {
				columns: [sql`"links"."created_at"`, sql`"links"."id"`],
				desc: true,
				of: (l) => [l.createdAt, l.id]
			};
	}
}

/** A page's cursor: the sort key of its last row, opaque to callers. */
export function encodeCursor(sort: Sort, key: (string | number)[]): string {
	return Buffer.from(JSON.stringify([sort, ...key])).toString('base64url');
}

/** The key in a cursor, or null when it is not one this sort made (a stale or hand-made cursor starts again). */
export function decodeCursor(
	sort: Sort,
	cursor: string | null | undefined
): (string | number)[] | null {
	if (!cursor || cursor.length > 1000) return null;
	try {
		const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
		if (!Array.isArray(value) || value[0] !== sort) return null;
		const key = value.slice(1);
		const want = sortKey(sort).columns.length;
		if (key.length !== want || key.some((k) => typeof k !== 'string' && typeof k !== 'number'))
			return null;
		return key as (string | number)[];
	} catch {
		return null;
	}
}

export interface Page {
	links: Link[];
	/** The cursor of the next page, or null on the last one. */
	next: string | null;
	/** How many links match in all (counted on the first page only; null on later ones). */
	total: number | null;
}

/** One page of a user's list: the view, the filters and the search, in the filters' sort, after `after`. */
export function searchLinks(
	db: DB,
	userId: string,
	view: View,
	f: Filters,
	{ after = null, limit = PAGE_SIZE }: { after?: string | null; limit?: number } = {}
): Page {
	const size = Math.max(1, Math.min(PAGE_MAX, Math.floor(limit) || PAGE_SIZE));
	const where = filterSql(userId, view, f);
	const key = sortKey(f.sort);
	const from = decodeCursor(f.sort, after);
	const cols = sql.join(key.columns, sql`, `);
	const seek = from
		? sql`(${cols}) ${key.desc ? sql`<` : sql`>`} (${sql.join(
				from.map((v) => sql`${v}`),
				sql`, `
			)})`
		: undefined;
	const order = sql.join(
		key.columns.map((c) => (key.desc ? sql`${c} DESC` : sql`${c} ASC`)),
		sql`, `
	);
	const rows = db
		.select()
		.from(links)
		.where(seek ? and(where, seek) : where)
		.orderBy(order)
		.limit(size + 1)
		.all();
	const more = rows.length > size;
	const page = more ? rows.slice(0, size) : rows;
	const total = from
		? null
		: more
			? (db
					.select({ n: sql<number>`count(*)` })
					.from(links)
					.where(where)
					.get()?.n ?? 0)
			: page.length;
	return {
		links: page,
		next: more ? encodeCursor(f.sort, key.of(page[page.length - 1])) : null,
		total
	};
}

/**
 * Rebuilds links_fts from the live links. FTS5's own 'rebuild' would index soft-deleted rows too (it reads every row
 * of links), and the triggers would then index a restored row twice: use this instead.
 */
export function reindexLinks(db: DB) {
	db.run(sql`INSERT INTO links_fts(links_fts) VALUES ('delete-all')`);
	db.run(sql`INSERT INTO links_fts(rowid, title, description, notes, url, site_name, tags_text, projects_text)
		SELECT rowid, title, description, notes, url, site_name, tags_text, projects_text FROM links WHERE deleted_at IS NULL`);
}
