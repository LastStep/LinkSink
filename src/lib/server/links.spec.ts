import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { links } from './db/schema.ts';
import { addLink, listLinks, toFtsQuery } from './links.ts';
import { createSyncWrite, type SyncWrite } from './sync/write.ts';
import { addUser, tempDatabase } from './test/db.ts';

describe('toFtsQuery', () => {
	it('quotes every word and matches it as a prefix', () => {
		expect(toFtsQuery('svelte run')).toBe('"svelte"* "run"*');
	});
	it('lets no FTS5 syntax through', () => {
		expect(toFtsQuery('title:x OR "y" NEAR(z) -w *')).toBe(
			'"title"* "x"* "OR"* "y"* "NEAR"* "z"* "w"*'
		);
	});
	it('returns null when nothing searchable is left', () => {
		expect(toFtsQuery('  -- "" ** ')).toBeNull();
	});
});

describe('listLinks and addLink', () => {
	let t: ReturnType<typeof tempDatabase>;
	let syncWrite: SyncWrite;
	beforeEach(() => {
		t = tempDatabase();
		addUser(t.db, 'u1');
		addUser(t.db, 'u2');
		syncWrite = createSyncWrite(t.db);
	});
	afterEach(() => t.close());

	it('finds links by a word prefix in the FTS5 index, for the right user only', () => {
		addLink(syncWrite, 'u1', {
			url: 'https://svelte.dev/docs/runes',
			title: 'Svelte runes explained'
		});
		addLink(syncWrite, 'u1', { url: 'https://orm.drizzle.team/docs', title: 'Drizzle migrations' });
		addLink(syncWrite, 'u2', { url: 'https://example.com/runes', title: 'Runes for u2' });
		expect(
			listLinks(t.db, 'u1')
				.map((l) => l.title)
				.sort()
		).toEqual(['Drizzle migrations', 'Svelte runes explained']);
		expect(listLinks(t.db, 'u1', 'run').map((l) => l.title)).toEqual(['Svelte runes explained']);
		expect(listLinks(t.db, 'u1', 'MIGRAT').map((l) => l.title)).toEqual(['Drizzle migrations']);
		expect(listLinks(t.db, 'u1', 'orm.drizzle').map((l) => l.title)).toEqual([
			'Drizzle migrations'
		]);
		expect(listLinks(t.db, 'u1', 'nothing')).toEqual([]);
	});

	it('keeps the index in step with edits and leaves soft-deleted links out', () => {
		const id = addLink(syncWrite, 'u1', { url: 'https://example.com/a', title: 'Old title' });
		syncWrite('u1', (w) => w.update(links, eq(links.id, id), { title: 'Fresh words' }));
		expect(listLinks(t.db, 'u1', 'old')).toEqual([]);
		expect(listLinks(t.db, 'u1', 'fresh')).toHaveLength(1);
		syncWrite('u1', (w) => w.softDelete(links, eq(links.id, id)));
		expect(listLinks(t.db, 'u1', 'fresh')).toEqual([]);
		expect(listLinks(t.db, 'u1')).toEqual([]);
	});

	it('refuses what is not an http(s) link', () => {
		expect(() => addLink(syncWrite, 'u1', { url: 'not a link' })).toThrow(TypeError);
		expect(() => addLink(syncWrite, 'u1', { url: 'javascript:alert(1)' })).toThrow(/http/);
	});
});
