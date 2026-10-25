// A list's search, filters and sort, and their form in the address (plan P-T-0002, step 7; F-web-mvp "Finding"):
// `?q=&source=<id>,<id>&media=video,article&tags=<id>,<id>&tagmode=any|all&projects=<id>&status=to_read
// &priority=high&archived=include|only&sort=edited|priority|title`. Within one filter any picked value matches;
// across filters all must; `tagmode=all` asks for every picked tag. Archived links stay out unless `archived` says
// otherwise. Shared by the server (the SQL in src/lib/server/search.ts) and the client (the URL, the store's check of
// a link it holds), so the two read one address the same way.
import { MEDIA, type Media, type Priority, type Status } from '../fields.ts';
import type { LinkJson } from '../store/types.ts';
import { foldedWords, matches, parseQuery, type Term } from './query.ts';

export const STATUS_FILTERS = ['to_read', 'in_progress', 'done', 'none'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Priorities by word in the address; `none` is a link with no priority. */
export const PRIORITY_FILTERS = ['high', 'medium', 'low', 'none'] as const;
export type PriorityFilter = (typeof PRIORITY_FILTERS)[number];
export const PRIORITY_OF: Record<PriorityFilter, Priority | null> = {
	high: 3,
	medium: 2,
	low: 1,
	none: null
};

export const SORTS = ['saved', 'edited', 'priority', 'title'] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABEL: Record<Sort, string> = {
	saved: 'Date saved',
	edited: 'Last edited',
	priority: 'Priority',
	title: 'Title'
};

export const ARCHIVED = ['exclude', 'include', 'only'] as const;
export type Archived = (typeof ARCHIVED)[number];

export interface Filters {
	q: string;
	source: string[];
	media: Media[];
	tags: string[];
	tagMode: 'any' | 'all';
	projects: string[];
	status: StatusFilter[];
	priority: PriorityFilter[];
	archived: Archived;
	sort: Sort;
}

export const NO_FILTERS: Filters = Object.freeze({
	q: '',
	source: [],
	media: [],
	tags: [],
	tagMode: 'any',
	projects: [],
	status: [],
	priority: [],
	archived: 'exclude',
	sort: 'saved'
}) as Filters;

/** The most values one filter takes, and the longest id. */
const MAX_VALUES = 50;
const ID = /^[0-9A-Za-z_-]{1,64}$/;
const Q_MAX = 200;

function list<T extends string>(raw: string | null, ok: (v: string) => boolean): T[] {
	if (!raw) return [];
	return [...new Set(raw.split(',').map((v) => v.trim()))]
		.filter((v) => v && ok(v))
		.slice(0, MAX_VALUES) as T[];
}
const oneOf =
	<T extends string>(values: readonly T[]) =>
	(v: string): v is T =>
		(values as readonly string[]).includes(v);

/** Reads the filters from an address's query. Anything it does not know is dropped, never an error. */
export function parseFilters(params: URLSearchParams): Filters {
	const pick = <T extends string>(name: string, values: readonly T[], fallback: T): T => {
		const v = params.get(name);
		return v && oneOf(values)(v) ? v : fallback;
	};
	return {
		q: (params.get('q') ?? '').trim().slice(0, Q_MAX),
		source: list(params.get('source'), (v) => ID.test(v)),
		media: list(params.get('media'), oneOf(MEDIA)),
		tags: list(params.get('tags'), (v) => ID.test(v)),
		tagMode: pick('tagmode', ['any', 'all'] as const, 'any'),
		projects: list(params.get('projects'), (v) => ID.test(v)),
		status: list(params.get('status'), oneOf(STATUS_FILTERS)),
		priority: list(params.get('priority'), oneOf(PRIORITY_FILTERS)),
		archived: pick('archived', ARCHIVED, 'exclude'),
		sort: pick('sort', SORTS, 'saved')
	};
}

/**
 * The address's query for some filters: only what differs from no filters, in a fixed order, commas left as commas
 * (a readable address to bookmark). Empty when nothing is set.
 */
export function filterQuery(f: Filters): string {
	const parts: string[] = [];
	const add = (name: string, value: string) => parts.push(`${name}=${value}`);
	const ids = (name: string, values: readonly string[]) =>
		values.length && add(name, values.map(encodeURIComponent).join(','));
	if (f.q.trim()) add('q', encodeURIComponent(f.q.trim()));
	ids('source', f.source);
	ids('media', f.media);
	ids('tags', f.tags);
	if (f.tags.length > 1 && f.tagMode === 'all') add('tagmode', 'all');
	ids('projects', f.projects);
	ids('status', f.status);
	ids('priority', f.priority);
	if (f.archived !== 'exclude') add('archived', f.archived);
	if (f.sort !== 'saved') add('sort', f.sort);
	return parts.join('&');
}

export const sameFilters = (a: Filters, b: Filters) => filterQuery(a) === filterQuery(b);

/** How many filters (not the search, not the sort) are set: the number on the Filters button. */
export function filterCount(f: Filters): number {
	return (
		(f.source.length ? 1 : 0) +
		(f.media.length ? 1 : 0) +
		(f.tags.length ? 1 : 0) +
		(f.projects.length ? 1 : 0) +
		(f.status.length ? 1 : 0) +
		(f.priority.length ? 1 : 0) +
		(f.archived !== 'exclude' ? 1 : 0)
	);
}

/** The fields the full-text index holds for a link (links_fts's columns), split into folded words. */
export function searchFields(link: LinkJson): string[][] {
	return [
		link.title,
		link.description,
		link.notes,
		link.url,
		link.siteName,
		link.tagsText,
		link.projectsText
	].map(foldedWords);
}

/**
 * Whether a link the store holds passes the filters and the search, as the server's query would decide: the client's
 * half of the shared rule. Archived links are judged by `archived` (the Archive view sets its own, `only`).
 * `terms` may be passed in when one parse serves many links.
 */
export function matchesFilters(
	f: Filters,
	link: LinkJson,
	terms: Term[] = parseQuery(f.q)
): boolean {
	const archived = link.archivedAt !== null;
	if (f.archived === 'exclude' && archived) return false;
	if (f.archived === 'only' && !archived) return false;
	if (f.source.length && !(link.sourceId && f.source.includes(link.sourceId))) return false;
	if (f.media.length && !(link.media && f.media.includes(link.media as Media))) return false;
	if (f.tags.length) {
		const has = (id: string) => link.tagIds.includes(id);
		if (f.tagMode === 'all' ? !f.tags.every(has) : !f.tags.some(has)) return false;
	}
	if (f.projects.length && !f.projects.some((id) => link.projectIds.includes(id))) return false;
	if (f.status.length) {
		const s = (link.status ?? 'none') as Status | 'none';
		if (!f.status.includes(s)) return false;
	}
	if (f.priority.length) {
		const ok = f.priority.some((p) => PRIORITY_OF[p] === (link.priority ?? null));
		if (!ok) return false;
	}
	return terms.length === 0 || matches(terms, searchFields(link));
}

/** Lower case for ASCII letters only, as SQLite's lower() does, so client and server put titles in one order. */
const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
/** The key a title sorts by, on both sides: the title, else the address. */
export const titleKey = (link: Pick<LinkJson, 'title' | 'url'>) =>
	asciiLower(link.title || link.url);

const cmp = (a: number | string, b: number | string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The order a sort puts links in, the same as the server's ORDER BY: saved and edited newest first, priority highest
 * first (then newest), title A to Z; ties by id, in the sort's direction.
 */
export function compareLinks(sort: Sort) {
	type L = Pick<LinkJson, 'id' | 'createdAt' | 'updatedAt' | 'priority' | 'title' | 'url'>;
	switch (sort) {
		case 'edited':
			return (a: L, b: L) => cmp(b.updatedAt, a.updatedAt) || cmp(b.id, a.id);
		case 'priority':
			return (a: L, b: L) =>
				cmp(b.priority ?? 0, a.priority ?? 0) || cmp(b.createdAt, a.createdAt) || cmp(b.id, a.id);
		case 'title':
			return (a: L, b: L) => cmp(titleKey(a), titleKey(b)) || cmp(a.id, b.id);
		default:
			return (a: L, b: L) => cmp(b.createdAt, a.createdAt) || cmp(b.id, a.id);
	}
}
