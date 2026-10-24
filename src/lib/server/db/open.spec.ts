import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './open.ts';
import { links } from './schema.ts';
import { addUser, tempDatabase } from '../test/db.ts';

let t: ReturnType<typeof tempDatabase>;
afterEach(() => t?.close());

describe('openDatabase', () => {
	it('opens in WAL mode with foreign keys on and a busy timeout', () => {
		t = tempDatabase();
		const client = t.db.$client;
		expect(client.pragma('journal_mode', { simple: true })).toBe('wal');
		expect(client.pragma('foreign_keys', { simple: true })).toBe(1);
		expect(client.pragma('busy_timeout', { simple: true })).toBe(5000);
	});

	it('applies the migrations in drizzle/, FTS5 included', () => {
		t = tempDatabase();
		const client = t.db.$client;
		const applied = client.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as {
			n: number;
		};
		expect(applied.n).toBe(5);
		const tables = (
			client.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
				name: string;
			}[]
		).map((r) => r.name);
		for (const name of [
			'user',
			'session',
			'account',
			'verification',
			'links',
			'links_fts',
			'sync_meta',
			'sync_clients'
		]) {
			expect(tables).toContain(name);
		}
	});

	it('gives links its version and deleted_at columns', () => {
		t = tempDatabase();
		const cols = t.db.$client.prepare('PRAGMA table_info(links)').all() as {
			name: string;
			notnull: number;
		}[];
		const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
		expect(byName.version?.notnull).toBe(1);
		expect(byName.deleted_at?.notnull).toBe(0);
	});

	it('enforces foreign keys', () => {
		t = tempDatabase();
		const insert = () =>
			t.db
				.insert(links)
				.values({
					id: 'L1',
					userId: 'nobody',
					url: 'https://example.com/',
					urlKey: 'https://example.com/',
					savedVia: 'paste',
					createdAt: 1,
					updatedAt: 1,
					version: 1
				})
				.run();
		expect(insert).toThrow(/FOREIGN KEY/);
		addUser(t.db, 'nobody');
		expect(insert).not.toThrow();
	});

	it('is safe to open again: the migrations already applied are skipped', () => {
		t = tempDatabase();
		addUser(t.db, 'u1');
		const second = openDatabase(t.db.$client.name);
		const applied = second.$client
			.prepare('SELECT count(*) AS n FROM __drizzle_migrations')
			.get() as {
			n: number;
		};
		expect(applied.n).toBe(5);
		expect(second.$client.prepare('SELECT count(*) AS n FROM user').get()).toEqual({ n: 1 });
		second.$client.close();
	});
});
