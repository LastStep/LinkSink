import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listLinks } from '../links.ts';
import { createSyncWrite } from '../sync/write.ts';
import { addUser } from '../test/db.ts';
import { openDatabase } from './open.ts';
import { links } from './schema.ts';

/** 0002 rebuilds links to add its foreign key to sources; 0003 puts back the full-text triggers it drops. */
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

describe('the sources migration on a database with links in it', () => {
	it('keeps every link and keeps search working, old rows and new', () => {
		dir = mkdtempSync(join(tmpdir(), 'linksink-migrate-'));
		const path = join(dir, 'test.db');
		const before = openDatabase(path, migrationsUpTo(2));
		addUser(before, 'u1');
		createSyncWrite(before)('u1', (w) => {
			w.insert(links, {
				id: 'a',
				url: 'https://a.example/',
				urlKey: 'a',
				title: 'Runes explained',
				savedVia: 'paste'
			});
			w.insert(links, {
				id: 'b',
				url: 'https://b.example/',
				urlKey: 'b',
				title: 'Drizzle migrations',
				savedVia: 'paste'
			});
		});
		before.$client.close();

		const after = openDatabase(path);
		const triggers = after.$client
			.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
			.all()
			.map((r) => (r as { name: string }).name);
		expect(triggers).toEqual(['links_fts_ad', 'links_fts_ai', 'links_fts_au']);
		expect(
			listLinks(after, 'u1')
				.map((l) => l.id)
				.sort()
		).toEqual(['a', 'b']);
		expect(listLinks(after, 'u1', 'run').map((l) => l.id)).toEqual(['a']);
		const syncWrite = createSyncWrite(after);
		syncWrite('u1', (w) => {
			w.insert(links, {
				id: 'c',
				url: 'https://c.example/',
				urlKey: 'c',
				title: 'Sourdough starter',
				savedVia: 'paste'
			});
		});
		expect(listLinks(after, 'u1', 'sourd').map((l) => l.id)).toEqual(['c']);
		const fk = after.$client.prepare('PRAGMA foreign_key_list(links)').all() as { table: string }[];
		expect(fk.map((f) => f.table).sort()).toEqual(['sources', 'user']);
		expect(after.$client.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
		after.$client.close();
	});
});
