// The verifiers' findings on T-0012 at 91ab57f (fix round M-2026-10-25-b32f82f3), each held by a test.
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { linkProjects, links, linkTags } from '../db/schema.ts';
import { listProjects, listTags } from '../organise.ts';
import { createSyncWrite, type SyncWrite } from '../sync/write.ts';
import { addUser, tempDatabase } from '../test/db.ts';
import { snapshot } from '../test/synced.ts';
import { createImportApi } from './api.ts';
import { parseImport } from './index.ts';

let t: ReturnType<typeof tempDatabase>;
let syncWrite: SyncWrite;
let me: { id: string };

beforeEach(() => {
	t = tempDatabase();
	syncWrite = createSyncWrite(t.db);
	me = { id: addUser(t.db, 'me') };
});
afterEach(() => t.close());

const upload = (body: string) =>
	new Request('http://localhost/api/import', {
		method: 'POST',
		headers: { 'content-type': 'application/octet-stream' },
		body
	});

async function importAs(body: string, write: SyncWrite = syncWrite) {
	const api = createImportApi({ db: t.db, syncWrite: write });
	const res = await api.import(me, upload(body));
	return { status: res.status, body: await res.json() };
}

const live = () =>
	t.db
		.select()
		.from(links)
		.where(and(eq(links.userId, me.id), isNull(links.deletedAt)))
		.all();

const head = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n';

describe('B1: folders that differ only in case', () => {
	it('the same address under "Reading" and "reading" is one link in one project, not a 500', async () => {
		const file =
			head +
			'<DT><H3>Reading</H3>\n<DL><p>\n<DT><A HREF="https://a.example/x" ADD_DATE="1700000000">X</A>\n</DL><p>\n' +
			'<DT><H3>reading</H3>\n<DL><p>\n<DT><A HREF="https://a.example/x" ADD_DATE="1700000000">X again</A>\n' +
			'<DT><A HREF="https://a.example/y" ADD_DATE="1700000000">Y</A>\n</DL><p>\n</DL><p>\n';
		const res = await importAs(file);
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ added: 2, duplicates: 1, failed: 0 });
		expect(live()).toHaveLength(2);
		expect(listProjects(t.db, me.id).map((p) => p.name)).toEqual(['Reading']);
		const joins = t.db.select().from(linkProjects).where(eq(linkProjects.userId, me.id)).all();
		expect(joins).toHaveLength(2);
	});
});

describe('B2: deep nesting', () => {
	it('a file nested 40,000 folders deep finishes or is refused within 2 s', async () => {
		const depth = 40_000;
		const file =
			head +
			'<DT><H3>Folder name</H3>\n<DL><p>\n'.repeat(depth) +
			'<DT><A HREF="https://deep.example/">Deep</A>\n' +
			'</DL><p>\n'.repeat(depth) +
			'</DL><p>\n';
		expect(file.length).toBeGreaterThan(1_000_000);
		const started = performance.now();
		const res = await importAs(file);
		const ms = performance.now() - started;
		expect(ms).toBeLessThan(2_000);
		expect([200, 400, 413]).toContain(res.status);
	});

	it('folders deeper than 32 levels fold into the 32nd level, and each name joins at most 64 characters', () => {
		const names = Array.from({ length: 40 }, (_, i) => `L${i + 1}`);
		const long = 'n'.repeat(100);
		const file =
			head +
			names.map((n) => `<DT><H3>${n}</H3>\n<DL><p>\n`).join('') +
			'<DT><A HREF="https://deep.example/a">A</A>\n' +
			'</DL><p>\n'.repeat(40) +
			`<DT><H3>${long}</H3>\n<DL><p>\n<DT><A HREF="https://deep.example/b">B</A>\n</DL><p>\n</DL><p>\n`;
		const { items } = parseImport(new TextEncoder().encode(file));
		expect(items[0].projects).toEqual([names.slice(0, 32).join(' / ')]);
		expect(items[1].projects).toEqual(['n'.repeat(64)]);
	});
});

describe('caps', () => {
	it('a link takes at most 100 tags, each cut to the 64-character tag-name limit', async () => {
		const tags = Array.from(
			{ length: 150 },
			(_, i) => `tag${String(i).padStart(3, '0')}${'x'.repeat(80)}`
		);
		const file = `${head}<DT><A HREF="https://t.example/" TAGS="${tags.join(',')}">T</A>\n</DL><p>\n`;
		const res = await importAs(file);
		expect(res.status).toBe(200);
		const names = listTags(t.db, me.id).map((x) => x.name);
		expect(names).toHaveLength(100);
		expect(names.every((n) => n.length === 64)).toBe(true);
		expect(t.db.select().from(linkTags).where(eq(linkTags.userId, me.id)).all()).toHaveLength(100);
	});
});

describe('a write that fails part-way', () => {
	const file = (n: number) =>
		head +
		Array.from({ length: n }, (_, i) => `<DT><A HREF="https://p.example/${i}">P${i}</A>\n`).join(
			''
		) +
		'</DL><p>\n';

	/** syncWrite that fails on its nth call. */
	const failingOn = (n: number): SyncWrite => {
		let calls = 0;
		return ((userId: string, fn: never) => {
			if (++calls === n) throw new Error('disk full');
			return syncWrite(userId, fn);
		}) as SyncWrite;
	};

	it('says how many links were saved and that importing again skips them; never "Nothing was lost"', async () => {
		const res = await importAs(file(1200), failingOn(2));
		expect(res.status).toBe(500);
		expect(res.body.error).toBe(
			'Something went wrong part-way: 500 links were saved. Import the same file again and those are skipped as duplicates.'
		);
		expect(live()).toHaveLength(500);
		const again = await importAs(file(1200));
		expect(again.body).toMatchObject({ added: 700, duplicates: 500 });
	});

	it('says nothing was saved when the first write fails', async () => {
		const before = snapshot(t.db);
		const res = await importAs(file(10), failingOn(1));
		expect(res.status).toBe(500);
		expect(res.body.error).toMatch(/nothing was saved/);
		expect(res.body.error).not.toMatch(/Nothing was lost/);
		expect(snapshot(t.db).rows).toEqual(before.rows);
	});
});

describe('exports', () => {
	it('send X-Content-Type-Options: nosniff', () => {
		const api = createImportApi({ db: t.db, syncWrite });
		expect(api.exportHtml(me).headers.get('x-content-type-options')).toBe('nosniff');
		expect(api.exportJson(me).headers.get('x-content-type-options')).toBe('nosniff');
	});
});
