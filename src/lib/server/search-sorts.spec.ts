import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compareLinks, NO_FILTERS, SORTS, type Filters, type Sort } from '../search/filters.ts';
import { links } from './db/schema.ts';
import { addLink, patchLink } from './links.ts';
import { searchLinks } from './search.ts';
import { createSyncWrite, type SyncWrite } from './sync/write.ts';
import { addUser, tempDatabase } from './test/db.ts';

// The Status and Last opened sorts (T-0025), on the server's query and against the client's comparator.
const f = (sort: Sort): Filters => ({ ...NO_FILTERS, sort });
const all = { kind: 'all' } as const;

describe('the status and last opened sorts', () => {
	let t: ReturnType<typeof tempDatabase>;
	let syncWrite: SyncWrite;
	beforeEach(() => {
		t = tempDatabase();
		addUser(t.db, 'u1');
		syncWrite = createSyncWrite(t.db);
	});
	afterEach(() => t.close());

	const make = (
		title: string,
		createdAt: number,
		status: 'to_read' | 'in_progress' | 'done' | null,
		openedAt: number | null
	) => {
		const id = addLink(syncWrite, 'u1', { url: `https://sorts.example/${title}`, title });
		if (status) patchLink(t.db, syncWrite, 'u1', id, { status });
		syncWrite('u1', (w) => w.update(links, eq(links.id, id), { createdAt, openedAt }));
		return id;
	};
	const order = (sort: Sort) =>
		searchLinks(t.db, 'u1', all, f(sort), { limit: 200 }).links.map((l) => l.title);

	it('orders by status as the status list shows it, links with none last, newest saved first within one', () => {
		make('none old', 1, null, null);
		make('done', 2, 'done', null);
		make('progress', 3, 'in_progress', null);
		make('to read old', 4, 'to_read', null);
		make('none new', 9, null, null);
		make('to read new', 8, 'to_read', null);
		expect(order('status')).toEqual([
			'to read new',
			'to read old',
			'progress',
			'done',
			'none new',
			'none old'
		]);
	});

	it('orders by last opened, newest first, links never opened last (newest saved first)', () => {
		make('opened long ago', 1, null, 100);
		make('never, old', 2, null, null);
		make('opened just now', 3, null, 900);
		make('never, new', 7, null, null);
		make('opened midway', 4, null, 500);
		expect(order('opened')).toEqual([
			'opened just now',
			'opened midway',
			'opened long ago',
			'never, new',
			'never, old'
		]);
	});

	it('pages by keyset in both sorts, with no row twice or missed, in the client comparator’s order', () => {
		const statuses = ['to_read', 'in_progress', 'done', null] as const;
		for (let i = 0; i < 115; i++)
			make(
				`m${i}`,
				1_000 + Math.floor(i / 4),
				statuses[i % 4],
				i % 3 === 0 ? null : 5_000 - (i % 11)
			);
		for (const sort of ['status', 'opened'] as const) {
			const seen: string[] = [];
			let after: string | null = null;
			const sizes: number[] = [];
			do {
				const page = searchLinks(t.db, 'u1', all, f(sort), { after });
				sizes.push(page.links.length);
				for (const l of page.links) seen.push(l.id);
				after = page.next;
			} while (after);
			expect(sizes, sort).toEqual([50, 50, 15]);
			expect(new Set(seen).size, sort).toBe(115);
			const one = searchLinks(t.db, 'u1', all, f(sort), { limit: 200 }).links;
			expect(seen, sort).toEqual(one.map((l) => l.id));
			expect(seen, sort).toEqual(
				[...one]
					.reverse()
					.sort(compareLinks(sort))
					.map((l) => l.id)
			);
		}
	});

	it('knows six sorts, and each is one the address reads back', () => {
		expect([...SORTS]).toEqual(['saved', 'edited', 'opened', 'title', 'priority', 'status']);
	});
});
