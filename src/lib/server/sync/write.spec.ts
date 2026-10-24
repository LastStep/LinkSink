import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { links, syncMeta } from '../db/schema.ts';
import { addUser, tempDatabase } from '../test/db.ts';
import { createSyncWrite, type SyncWrite } from './write.ts';

let t: ReturnType<typeof tempDatabase>;
let syncWrite: SyncWrite;

beforeEach(() => {
	t = tempDatabase();
	addUser(t.db, 'u1');
	addUser(t.db, 'u2');
	syncWrite = createSyncWrite(t.db);
});
afterEach(() => t.close());

const link = (id: string, url = `https://example.com/${id}`) => ({
	id,
	url,
	urlKey: url,
	savedVia: 'paste'
});
const row = (id: string) => t.db.select().from(links).where(eq(links.id, id)).get();
const versionOf = (userId: string) =>
	t.db.select().from(syncMeta).where(eq(syncMeta.userId, userId)).get()?.version ?? 0;

describe('syncWrite', () => {
	it('gives two writes increasing versions and stamps each row with its own write', () => {
		const v1 = syncWrite('u1', (w) => {
			w.insert(links, link('a'));
			return w.version;
		});
		const v2 = syncWrite('u1', (w) => {
			w.insert(links, link('b'));
			return w.version;
		});
		expect(v1).toBe(1);
		expect(v2).toBe(2);
		expect(row('a')?.version).toBe(1);
		expect(row('b')?.version).toBe(2);
		expect(versionOf('u1')).toBe(2);
	});

	it('bumps the version once per write, however many rows it changes', () => {
		syncWrite('u1', (w) => {
			w.insert(links, link('a'));
			w.insert(links, link('b'));
			w.insert(links, link('c'));
		});
		expect(versionOf('u1')).toBe(1);
		const changed = syncWrite('u1', (w) =>
			w.update(links, eq(links.savedVia, 'paste'), { notes: 'n' })
		);
		expect(changed).toBe(3);
		expect(versionOf('u1')).toBe(2);
		expect(['a', 'b', 'c'].map((id) => row(id)?.version)).toEqual([2, 2, 2]);
	});

	it('stamps updates with the new version and updated_at, and fills user_id, created_at and updated_at on insert', () => {
		syncWrite('u1', (w) => w.insert(links, link('a')));
		const inserted = row('a')!;
		expect(inserted.userId).toBe('u1');
		expect(inserted.deletedAt).toBeNull();
		expect(inserted.createdAt).toBeGreaterThan(0);
		expect(inserted.updatedAt).toBe(inserted.createdAt);

		const now = syncWrite('u1', (w) => {
			w.update(links, eq(links.id, 'a'), { title: 'Renamed' });
			return w.now;
		});
		const updated = row('a')!;
		expect(updated.title).toBe('Renamed');
		expect(updated.version).toBe(2);
		expect(updated.updatedAt).toBe(now);
		expect(updated.createdAt).toBe(inserted.createdAt);
	});

	it('soft-deletes: the row stays, with deleted_at and the new version set', () => {
		syncWrite('u1', (w) => w.insert(links, link('a')));
		const { n, now } = syncWrite('u1', (w) => ({
			n: w.softDelete(links, eq(links.id, 'a')),
			now: w.now
		}));
		expect(n).toBe(1);
		const gone = row('a');
		expect(gone).toBeDefined();
		expect(gone?.deletedAt).toBe(now);
		expect(gone?.version).toBe(2);

		// Deleting it again changes nothing: a tombstone keeps the version it was deleted at.
		const again = syncWrite('u1', (w) => w.softDelete(links, eq(links.id, 'a')));
		expect(again).toBe(0);
		expect(row('a')?.version).toBe(2);
	});

	it('lets a deleted URL be saved again (the unique index covers live rows only)', () => {
		syncWrite('u1', (w) => w.insert(links, link('a', 'https://example.com/same')));
		expect(() =>
			syncWrite('u1', (w) => w.insert(links, link('b', 'https://example.com/same')))
		).toThrow(/UNIQUE/);
		syncWrite('u1', (w) => w.softDelete(links, eq(links.id, 'a')));
		syncWrite('u1', (w) => w.insert(links, link('c', 'https://example.com/same')));
		expect(row('c')?.deletedAt).toBeNull();
	});

	it('rolls everything back, version included, when the write throws', () => {
		syncWrite('u1', (w) => w.insert(links, link('a')));
		expect(() =>
			syncWrite('u1', (w) => {
				w.update(links, eq(links.id, 'a'), { title: 'half done' });
				throw new Error('boom');
			})
		).toThrow('boom');
		expect(versionOf('u1')).toBe(1);
		expect(row('a')?.title).toBeNull();
		expect(row('a')?.version).toBe(1);
	});

	it("keeps users apart: each has its own version, and a write never touches another user's rows", () => {
		syncWrite('u1', (w) => w.insert(links, link('a')));
		syncWrite('u2', (w) => w.insert(links, link('b')));
		expect(versionOf('u1')).toBe(1);
		expect(versionOf('u2')).toBe(1);
		const changed = syncWrite('u2', (w) =>
			w.update(links, eq(links.id, 'a'), { title: 'not yours' })
		);
		expect(changed).toBe(0);
		expect(syncWrite('u2', (w) => w.softDelete(links, eq(links.id, 'a')))).toBe(0);
		expect(row('a')?.title).toBeNull();
		expect(row('a')?.deletedAt).toBeNull();
	});
});
