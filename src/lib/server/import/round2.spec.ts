// T-0012 fix round 2 (M-2026-10-25-e43d804d): a long import leaves the server answering, and folders cannot make an
// unbounded number of projects or overflow the call stack.
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { links, projects } from '../db/schema.ts';
import { createProject, listProjects } from '../organise.ts';
import { createSyncWrite, type SyncWrite } from '../sync/write.ts';
import { addUser, tempDatabase } from '../test/db.ts';
import { snapshot } from '../test/synced.ts';
import { createImportApi } from './api.ts';
import { importItems } from './index.ts';
import type { ImportItem } from './types.ts';

let t: ReturnType<typeof tempDatabase>;
let syncWrite: SyncWrite;
let me: { id: string };
beforeEach(() => {
	t = tempDatabase();
	syncWrite = createSyncWrite(t.db);
	me = { id: addUser(t.db, 'me') };
});
afterEach(() => t.close());

const item = (i: number, extra: Partial<ImportItem> = {}): ImportItem => ({
	url: `https://r.example.com/${i}`,
	title: null,
	tags: [],
	projects: [],
	createdAt: null,
	notes: null,
	status: null,
	archived: false,
	line: i + 1,
	...extra
});

const live = () =>
	t.db
		.select()
		.from(links)
		.where(and(eq(links.userId, me.id), isNull(links.deletedAt)))
		.all();

describe('a long import', () => {
	it('gives the event loop a turn between batches, so the server answers during it (C1)', async () => {
		let turns = 0;
		const timer = setInterval(() => turns++, 0);
		const result = importItems(
			t.db,
			syncWrite,
			me.id,
			Array.from({ length: 3_000 }, (_, i) => item(i))
		);
		await result;
		clearInterval(timer);
		expect((await result).added).toBe(3_000);
		// Six batches: the interval runs between them. Written in one go, it would not run before the end.
		expect(turns).toBeGreaterThanOrEqual(3);
	});
});

describe('projects from folders (C2)', () => {
	const file = (folders: number) =>
		'<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n' +
		Array.from(
			{ length: folders },
			(_, i) =>
				`<DT><H3>Folder ${i}</H3>\n<DL><p>\n<DT><A HREF="https://f.example.com/${i}">F${i}</A>\n</DL><p>\n`
		).join('') +
		'</DL><p>\n';
	const upload = (body: string) =>
		new Request('http://localhost/api/import', {
			method: 'POST',
			headers: { 'content-type': 'application/octet-stream' },
			body
		});

	it('a file that would make 1,001 new projects is refused, with a message, and nothing is written', async () => {
		createProject(t.db, syncWrite, me.id, { name: 'Folder 0' });
		const api = createImportApi({ db: t.db, syncWrite });
		const before = snapshot(t.db);
		const res = await api.import(me, upload(file(1_002)));
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe(
			'That file would make 1,001 new projects (one for each folder); one import makes at most 1,000. Nothing was imported.'
		);
		expect(snapshot(t.db)).toEqual(before);
	});

	it('1,000 new projects is allowed', async () => {
		const api = createImportApi({ db: t.db, syncWrite });
		const res = await api.import(me, upload(file(1_000)));
		expect(res.status).toBe(200);
		expect(listProjects(t.db, me.id)).toHaveLength(1_000);
	});

	it('with 130,000 projects, making one more (by hand or by import) does not overflow the call stack', async () => {
		const insert = t.db.$client.prepare(
			`INSERT INTO projects (id, user_id, name, color, position, created_at, version) VALUES (?, ?, ?, 'green', ?, 1, 1)`
		);
		t.db.$client.transaction(() => {
			for (let i = 0; i < 130_000; i++) insert.run(`P${i}`, me.id, `Existing ${i}`, i);
		})();
		const made = createProject(t.db, syncWrite, me.id, { name: 'One more' });
		expect(made.position).toBe(130_000);
		const result = await importItems(t.db, syncWrite, me.id, [
			item(1, { projects: ['From a file'] })
		]);
		expect(result.added).toBe(1);
		const p = t.db.select().from(projects).where(eq(projects.name, 'From a file')).get()!;
		expect(p.position).toBe(130_001);
		expect(live()).toHaveLength(1);
	}, 60_000);
});
