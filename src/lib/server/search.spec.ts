import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	matchesFilters,
	NO_FILTERS,
	compareLinks,
	type Filters,
	type Sort
} from '../search/filters.ts';
import { parseQuery } from '../search/query.ts';
import type { View } from '../store/types.ts';
import { openDatabase, type DB } from './db/open.ts';
import { links, sources } from './db/schema.ts';
import { addLink, deleteLink, linksJson, patchLink, restoreLink, type LinkPatch } from './links.ts';
import { createProject, createTag } from './organise.ts';
import { decodeCursor, encodeCursor, reindexLinks, searchLinks } from './search.ts';
import { createSyncWrite, type SyncWrite } from './sync/write.ts';
import { addUser, tempDatabase } from './test/db.ts';

const f = (over: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...over });

/** How many links the full-text index holds (its own records, not the content table's). */
const indexed = (db: DB) =>
	(db.$client.prepare('SELECT count(*) AS n FROM links_fts_docsize').get() as { n: number }).n;
const ftsHits = (db: DB, match: string) =>
	(
		db.$client
			.prepare('SELECT count(*) AS n FROM links_fts WHERE links_fts MATCH ?')
			.get(match) as { n: number }
	).n;

describe('the list query', () => {
	let t: ReturnType<typeof tempDatabase>;
	let syncWrite: SyncWrite;
	const ids: Record<string, string> = {};
	let ai: string, rec: string, work: string, home: string, yt: string, gh: string;

	const make = (key: string, url: string, title: string, patch: LinkPatch = {}) => {
		ids[key] = addLink(syncWrite, 'u1', { url, title });
		if (Object.keys(patch).length) patchLink(t.db, syncWrite, 'u1', ids[key], patch);
	};
	const titles = (view: View, filters: Filters) =>
		searchLinks(t.db, 'u1', view, filters, { limit: 200 })
			.links.map((l) => l.title)
			.sort();

	beforeEach(() => {
		t = tempDatabase();
		addUser(t.db, 'u1');
		addUser(t.db, 'u2');
		syncWrite = createSyncWrite(t.db);
		[yt, gh] = ['YouTube', 'GitHub'].map((name) =>
			syncWrite('u1', (w) => {
				const id = `src-${name}`;
				w.insert(sources, { id, name, hosts: '[]' });
				return id;
			})
		);
		ai = createTag(t.db, syncWrite, 'u1', { name: 'ai' }).tag.id;
		rec = createTag(t.db, syncWrite, 'u1', { name: 'recommendations' }).tag.id;
		work = createProject(t.db, syncWrite, 'u1', { name: 'Work' }).id;
		home = createProject(t.db, syncWrite, 'u1', { name: 'Home' }).id;
		make('talk', 'https://youtube.com/watch?v=1', 'Deep learning talk', {
			sourceId: yt,
			media: 'video',
			status: 'to_read',
			priority: 3,
			tagIds: [ai, rec],
			projectIds: [work]
		});
		make('repo', 'https://github.com/x/y', 'Runes library', {
			sourceId: gh,
			media: 'repo',
			status: 'done',
			priority: 1,
			tagIds: [ai],
			notes: 'café notes'
		});
		make('essay', 'https://blog.example/essay', 'An essay on learning', {
			media: 'article',
			status: 'in_progress',
			tagIds: [rec],
			projectIds: [home]
		});
		make('bare', 'https://bare.example/', 'Bare page');
		make('old', 'https://old.example/', 'Archived learning', {
			media: 'article',
			tagIds: [ai],
			archived: true
		});
		make('gone', 'https://gone.example/', 'Deleted learning');
		deleteLink(syncWrite, 'u1', ids.gone);
		addLink(syncWrite, 'u2', { url: 'https://other.example/', title: 'Someone else learning' });
	});
	afterEach(() => t.close());

	const all: View = { kind: 'all' };
	// [what, view, filters, the titles listed]
	const table = (): [string, View, Filters, string[]][] => [
		[
			'every live unarchived link',
			all,
			NO_FILTERS,
			['An essay on learning', 'Bare page', 'Deep learning talk', 'Runes library']
		],
		[
			'search, prefix on the last word',
			all,
			f({ q: 'learn' }),
			['An essay on learning', 'Deep learning talk']
		],
		['search, an earlier word is whole', all, f({ q: 'learn talk' }), []],
		['search, a phrase', all, f({ q: '"deep learning"' }), ['Deep learning talk']],
		['search, phrase in the wrong order', all, f({ q: '"learning deep"' }), []],
		[
			'search finds tags',
			all,
			f({ q: 'recommend' }),
			['An essay on learning', 'Deep learning talk']
		],
		['search finds projects', all, f({ q: 'work' }), ['Deep learning talk']],
		['search finds notes, accents folded', all, f({ q: 'cafe' }), ['Runes library']],
		['search finds the address', all, f({ q: 'github' }), ['Runes library']],
		[
			'source, any of two',
			all,
			f({ source: ['src-YouTube', 'src-GitHub'] }),
			['Deep learning talk', 'Runes library']
		],
		[
			'media, any of two',
			all,
			f({ media: ['video', 'article'] }),
			['An essay on learning', 'Deep learning talk']
		],
		[
			'tags any',
			all,
			f({ tags: ['$ai', '$rec'] }),
			['An essay on learning', 'Deep learning talk', 'Runes library']
		],
		['tags all', all, f({ tags: ['$ai', '$rec'], tagMode: 'all' }), ['Deep learning talk']],
		[
			'projects any',
			all,
			f({ projects: ['$work', '$home'] }),
			['An essay on learning', 'Deep learning talk']
		],
		[
			'status, any of two',
			all,
			f({ status: ['to_read', 'done'] }),
			['Deep learning talk', 'Runes library']
		],
		['status none', all, f({ status: ['none'] }), ['Bare page']],
		['priority high', all, f({ priority: ['high'] }), ['Deep learning talk']],
		[
			'priority none or low',
			all,
			f({ priority: ['none', 'low'] }),
			['An essay on learning', 'Bare page', 'Runes library']
		],
		[
			'across filters: all must match',
			all,
			f({ tags: ['$ai'], media: ['repo'] }),
			['Runes library']
		],
		[
			'across filters with search',
			all,
			f({ q: 'learning', tags: ['$rec'], status: ['in_progress'] }),
			['An essay on learning']
		],
		[
			'archived included',
			all,
			f({ archived: 'include', q: 'learning' }),
			['An essay on learning', 'Archived learning', 'Deep learning talk']
		],
		['archived only', all, f({ archived: 'only' }), ['Archived learning']],
		['the Archive view is archived only', { kind: 'archive' }, NO_FILTERS, ['Archived learning']],
		[
			'a tag view narrowed by a filter',
			{ kind: 'tag', id: '$ai' },
			f({ status: ['done'] }),
			['Runes library']
		],
		[
			'a project view with search',
			{ kind: 'project', id: '$work' },
			f({ q: 'deep' }),
			['Deep learning talk']
		],
		['Unsorted', { kind: 'unsorted' }, NO_FILTERS, ['Bare page']],
		['an unknown id matches nothing', all, f({ tags: ['nope'] }), []]
	];
	const resolveIds = (filters: Filters, view: View) => {
		const swap = (v: string) => ({ $ai: ai, $rec: rec, $work: work, $home: home })[v as '$ai'] ?? v;
		const v: View = 'id' in view ? { ...view, id: swap(view.id) } : view;
		return {
			view: v,
			filters: { ...filters, tags: filters.tags.map(swap), projects: filters.projects.map(swap) }
		};
	};
	it.each(table().map((row, i) => [row[0], i] as const))('%s', (_, i) => {
		const [, view, filters, want] = table()[i];
		const r = resolveIds(filters, view);
		expect(titles(r.view, r.filters)).toEqual(want);
	});

	it('agrees with the client-side check on every row of the table', () => {
		for (const [what, view, filters] of table()) {
			if (view.kind !== 'all') continue;
			const r = resolveIds(filters, view);
			const every = linksJson(
				t.db,
				'u1',
				t.db.select().from(links).where(eq(links.userId, 'u1')).all()
			).filter((l) => l.deletedAt === null);
			const client = every
				.filter((l) => matchesFilters(r.filters, l, parseQuery(r.filters.q)))
				.map((l) => l.title)
				.sort();
			expect(client, what).toEqual(titles(r.view, r.filters));
		}
	});

	it("answers for one user only, never another's links", () => {
		expect(titles(all, f({ q: 'someone' }))).toEqual([]);
		expect(searchLinks(t.db, 'u2', all, f({ q: 'learning' })).links.map((l) => l.title)).toEqual([
			'Someone else learning'
		]);
	});

	it('pages by keyset, 50 a page, in each sort, with no row twice or missed', () => {
		for (let i = 0; i < 115; i++) {
			const id = addLink(syncWrite, 'u1', {
				url: `https://many.example/${i}`,
				title: `${i % 7 === 0 ? 'zeta' : 'Alpha'} ${String(i).padStart(3, '0')}`
			});
			if (i % 3 === 0) patchLink(t.db, syncWrite, 'u1', id, { priority: ((i % 9) / 3 + 1) as 1 });
			// many share a created_at: the id breaks the tie
			syncWrite('u1', (w) =>
				w.update(links, eq(links.id, id), {
					createdAt: 1_000 + Math.floor(i / 4),
					updatedAt: 5_000 - Math.floor(i / 3)
				})
			);
		}
		const sorts: Sort[] = ['saved', 'edited', 'priority', 'title'];
		for (const sort of sorts) {
			const filters = f({ sort });
			const seen: string[] = [];
			let after: string | null = null;
			const sizes: number[] = [];
			let first = true;
			do {
				const page = searchLinks(t.db, 'u1', all, filters, { after });
				if (first) expect(page.total, sort).toBe(119);
				else expect(page.total).toBeNull();
				first = false;
				sizes.push(page.links.length);
				seen.push(...page.links.map((l) => l.id));
				after = page.next;
			} while (after);
			expect(sizes, sort).toEqual([50, 50, 19]);
			expect(new Set(seen).size, sort).toBe(119);
			// the same order as one big page, and as the client's comparator
			const one = searchLinks(t.db, 'u1', all, filters, { limit: 200 }).links;
			expect(seen, sort).toEqual(one.map((l) => l.id));
			expect(seen, sort).toEqual([...one].sort(compareLinks(sort)).map((l) => l.id));
		}
	});

	it('starts again from the top on a cursor that is not its own', () => {
		const top = searchLinks(t.db, 'u1', all, NO_FILTERS).links.map((l) => l.id);
		for (const bad of ['nonsense', encodeCursor('title', ['a', 'b']), encodeCursor('saved', [1])]) {
			expect(
				searchLinks(t.db, 'u1', all, NO_FILTERS, { after: bad }).links.map((l) => l.id)
			).toEqual(top);
		}
		expect(decodeCursor('saved', encodeCursor('saved', [5, 'x']))).toEqual([5, 'x']);
	});

	it('caps a page at 200 rows', () => {
		for (let i = 0; i < 205; i++)
			addLink(syncWrite, 'u1', { url: `https://cap.example/${i}`, title: 'cap' });
		expect(searchLinks(t.db, 'u1', all, NO_FILTERS, { limit: 1000 }).links).toHaveLength(200);
	});
});

describe('links_fts holds live links only', () => {
	let t: ReturnType<typeof tempDatabase>;
	let syncWrite: SyncWrite;
	beforeEach(() => {
		t = tempDatabase();
		addUser(t.db, 'u1');
		syncWrite = createSyncWrite(t.db);
	});
	afterEach(() => t.close());

	it('drops a link on delete, takes it back on restore, follows each edit', () => {
		const id = addLink(syncWrite, 'u1', { url: 'https://a.example/', title: 'Zebra stripes' });
		addLink(syncWrite, 'u1', { url: 'https://b.example/', title: 'Other' });
		expect(indexed(t.db)).toBe(2);
		expect(ftsHits(t.db, 'zebra')).toBe(1);
		deleteLink(syncWrite, 'u1', id);
		expect(indexed(t.db)).toBe(1);
		expect(ftsHits(t.db, 'zebra')).toBe(0);
		// an edit to a tombstone (a sync write bumping its version) leaves the index alone
		syncWrite('u1', (w) => w.update(links, eq(links.id, id), { title: 'Zebra again' }));
		expect(indexed(t.db)).toBe(1);
		restoreLink(t.db, syncWrite, 'u1', id);
		expect(indexed(t.db)).toBe(2);
		expect(ftsHits(t.db, 'zebra')).toBe(1);
		expect(ftsHits(t.db, 'stripes')).toBe(0);
		patchLink(t.db, syncWrite, 'u1', id, { title: 'Lion mane' });
		expect(ftsHits(t.db, 'zebra')).toBe(0);
		expect(ftsHits(t.db, 'lion')).toBe(1);
		// a hard delete of a live row takes it out too
		t.db.run(sql`DELETE FROM links WHERE id = ${id}`);
		expect(indexed(t.db)).toBe(1);
		expect(ftsHits(t.db, 'lion')).toBe(0);
	});

	it('reindexLinks rebuilds it from live links alone', () => {
		const id = addLink(syncWrite, 'u1', { url: 'https://a.example/', title: 'Zebra' });
		addLink(syncWrite, 'u1', { url: 'https://b.example/', title: 'Other' });
		deleteLink(syncWrite, 'u1', id);
		reindexLinks(t.db);
		expect(indexed(t.db)).toBe(1);
		restoreLink(t.db, syncWrite, 'u1', id);
		expect(indexed(t.db)).toBe(2);
		expect(ftsHits(t.db, 'zebra')).toBe(1);
	});

	it('uses unicode61 with diacritics removed and 2- and 3-letter prefix indexes', () => {
		const ddl = (
			t.db.$client.prepare("SELECT sql FROM sqlite_master WHERE name = 'links_fts'").get() as {
				sql: string;
			}
		).sql;
		expect(ddl).toContain("tokenize='unicode61 remove_diacritics 2'");
		expect(ddl).toContain("prefix='2 3'");
		for (const col of ['title', 'description', 'notes', 'url', 'tags_text', 'projects_text']) {
			expect(ddl).toContain(col);
		}
	});
});

describe('the 0005 migration on a database with links in it', () => {
	let dir: string;
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	function migrationsUpTo(count: number) {
		const folder = join(dir, 'drizzle');
		mkdirSync(join(folder, 'meta'), { recursive: true });
		const journal = JSON.parse(readFileSync(resolve('drizzle/meta/_journal.json'), 'utf-8'));
		journal.entries = journal.entries.slice(0, count);
		writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify(journal));
		for (const entry of journal.entries) {
			copyFileSync(resolve('drizzle', `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
		}
		return folder;
	}

	it('takes soft-deleted links out of the index and keeps the live ones searchable', () => {
		dir = mkdtempSync(join(tmpdir(), 'linksink-migrate-'));
		const path = join(dir, 'test.db');
		const before = openDatabase(path, migrationsUpTo(5));
		addUser(before, 'u1');
		const write = createSyncWrite(before);
		const live = addLink(write, 'u1', { url: 'https://a.example/', title: 'Live zebra' });
		const gone = addLink(write, 'u1', { url: 'https://b.example/', title: 'Gone zebra' });
		deleteLink(write, 'u1', gone);
		expect(indexed(before)).toBe(2); // before 0005 the tombstone stays indexed
		before.$client.close();

		const after = openDatabase(path);
		expect(indexed(after)).toBe(1);
		expect(
			searchLinks(after, 'u1', { kind: 'all' }, f({ q: 'zebra' })).links.map((l) => l.id)
		).toEqual([live]);
		const write2 = createSyncWrite(after);
		restoreLink(after, write2, 'u1', gone);
		expect(ftsHits(after, 'zebra')).toBe(2);
		after.$client.close();
	});
});
