import { readFileSync } from 'node:fs';
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { links, projects, syncMeta, tags } from '../db/schema.ts';
import { createFeeder, nextPending } from '../fetch/feeder.ts';
import { createFetchQueue } from '../fetch/queue.ts';
import { linksJson, patchLink, deleteLink, saveLink } from '../links.ts';
import { createProject, createTag, listProjects, listTags } from '../organise.ts';
import { createSyncWrite, type SyncWrite } from '../sync/write.ts';
import { addUser, tempDatabase } from '../test/db.ts';
import { snapshot, type Snapshot } from '../test/synced.ts';
import { createImportApi, type ImportApi } from './api.ts';
import { importItems } from './index.ts';
import type { ImportItem } from './types.ts';

let t: ReturnType<typeof tempDatabase>;
let syncWrite: SyncWrite;
let api: ImportApi;
/** How many times an import told the fetch queue there are links waiting. */
let kicks: number;
let alice: { id: string };
let bob: { id: string };

beforeEach(() => {
	t = tempDatabase();
	syncWrite = createSyncWrite(t.db);
	kicks = 0;
	api = createImportApi({ db: t.db, syncWrite, onImported: () => kicks++ });
	alice = { id: addUser(t.db, 'alice') };
	bob = { id: addUser(t.db, 'bob') };
});
afterEach(() => t.close());

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

const upload = (body: BodyInit, type = 'application/octet-stream', headers: HeadersInit = {}) =>
	new Request('http://localhost/api/import', {
		method: 'POST',
		headers: { 'content-type': type, ...headers },
		body
	});

/**
 * Throws if a synced row changed without a version newer than its user's before the call (ADR-0001), or vanished.
 * An import is one write per batch of 500, so its rows carry each batch's version, up to the user's version after
 * (test/synced.ts's expectVersioned checks a call that is one write). Returns how many rows changed.
 */
function expectBatched(before: Snapshot, after: Snapshot): number {
	let changed = 0;
	for (const key of before.rows.keys())
		if (!after.rows.has(key)) throw new Error(`${key} was removed`);
	for (const [key, row] of after.rows) {
		const was = before.rows.get(key);
		if (was && was.content === row.content && was.version === row.version) continue;
		changed++;
		const floor = before.versions.get(row.userId) ?? 0;
		const now = after.versions.get(row.userId) ?? 0;
		if (row.version <= floor || row.version > now) {
			throw new Error(
				`${key} changed without a new version: ${row.version}, user's ${floor} to ${now}`
			);
		}
	}
	return changed;
}

/** Imports as `who`, checking every synced row the call changed carries a new version. */
async function importAs(who: { id: string } | null, body: BodyInit, type?: string) {
	const before = snapshot(t.db);
	const res = await api.import(who, upload(body, type));
	const changed = expectBatched(before, snapshot(t.db));
	return { status: res.status, body: await res.json(), changed };
}

const userLinks = (userId: string) =>
	t.db
		.select()
		.from(links)
		.where(and(eq(links.userId, userId), isNull(links.deletedAt)))
		.all();

/** The user's links as a person sees them: address, title, tag and project names, notes, status, saved date. */
function seen(userId: string) {
	const tagNames = new Map(listTags(t.db, userId).map((x) => [x.id, x.name]));
	const projectNames = new Map(listProjects(t.db, userId).map((x) => [x.id, x.name]));
	return linksJson(t.db, userId, userLinks(userId))
		.map((l) => ({
			url: l.url,
			title: l.title,
			tags: l.tagIds.map((id) => tagNames.get(id)).sort(),
			projects: l.projectIds.map((id) => projectNames.get(id)).sort(),
			notes: l.notes,
			status: l.status,
			archived: l.archivedAt !== null,
			createdAt: l.createdAt
		}))
		.sort((a, b) => a.url.localeCompare(b.url));
}

const version = (userId: string) =>
	t.db.select().from(syncMeta).where(eq(syncMeta.userId, userId)).get()?.version ?? 0;

// What each fixture adds; duplicates are by url_key, within the file; failed are lines that gave no web link.
const summaries: [string, string, number, number, number][] = [
	['chrome.html', 'netscape', 4, 0, 1],
	['firefox.html', 'netscape', 4, 1, 1],
	['raindrop.html', 'netscape', 3, 1, 0],
	['pinboard.html', 'netscape', 3, 0, 0],
	['linkding.html', 'netscape', 3, 0, 0],
	['pocket.csv', 'pocket-csv', 4, 1, 2],
	['pocket-cursor.csv', 'pocket-csv', 1, 0, 0]
];

describe('POST /api/import', () => {
	it.each(summaries)(
		'%s: answers with a summary',
		async (name, format, added, duplicates, failed) => {
			const res = await importAs(alice, fixture(name));
			expect(res.status).toBe(200);
			expect(res.body).toMatchObject({ format, added, duplicates, failed });
			expect(res.body.failures).toHaveLength(Math.min(failed, 5));
			expect(userLinks(alice.id)).toHaveLength(added);
			expect(
				userLinks(alice.id).every((l) => l.savedVia === 'import' && l.metaState === 'pending')
			).toBe(true);
			// The fetch queue's feeder reads the pending links from the database; the import tells it once.
			expect(kicks).toBe(1);
		}
	);

	it('chrome.html: folders become projects (nested names joined), the bar is no project, dates kept', async () => {
		await importAs(alice, fixture('chrome.html'));
		expect(seen(alice.id)).toEqual([
			{
				url: 'https://github.com/sveltejs/kit',
				title: 'SvelteKit',
				tags: [],
				projects: ['Other bookmarks'],
				notes: null,
				status: null,
				archived: false,
				createdAt: 1700000410000
			},
			{
				url: 'https://news.example.org/item/1',
				title: 'News item',
				tags: [],
				projects: ['Reading'],
				notes: null,
				status: null,
				archived: false,
				createdAt: 1700000230000
			},
			{
				url: 'https://svelte.dev/docs',
				title: 'Svelte docs',
				tags: [],
				projects: [],
				notes: null,
				status: null,
				archived: false,
				createdAt: 1700000100000
			},
			{
				url: 'https://www.example.com/essay',
				title: 'An essay & a <b>bold</b> claim',
				tags: [],
				projects: ['Reading / Long reads'],
				notes: null,
				status: null,
				archived: false,
				createdAt: 1700000220000
			}
		]);
		const res = await importAs(alice, fixture('chrome.html'));
		expect(res.body).toMatchObject({ added: 0, duplicates: 4, failed: 1 });
		expect(res.body.failures).toEqual([
			{ line: 24, reason: 'Not a web address (chrome://settings/).' }
		]);
	});

	it('raindrop.html: a second copy of an address is skipped and its tags and folders join the first', async () => {
		await importAs(alice, fixture('raindrop.html'));
		expect(seen(alice.id).find((l) => l.url === 'https://my-link-2.com/page')).toMatchObject({
			tags: ['second tag', 'tag1', 'tag3'],
			projects: ['Parent Folder / Child Folder', 'Unsorted']
		});
		expect(listTags(t.db, alice.id).map((x) => x.name)).toEqual(['second tag', 'tag1', 'tag3']);
	});

	it('pinboard.html and linkding.html: <DD> becomes notes, stored as text; linkding archived stays archived', async () => {
		await importAs(alice, fixture('pinboard.html'));
		await importAs(alice, fixture('linkding.html'));
		const all = seen(alice.id);
		expect(all.find((l) => l.url === 'https://blog.example.net/post/42')).toMatchObject({
			title: 'A post with <script>alert(1)</script> in its title',
			notes: 'Two lines of notes:\nsecond line, with <img src=x onerror=alert(1)> as text.',
			tags: ['writing']
		});
		expect(all.find((l) => l.url === 'https://linkding.link/')).toMatchObject({
			notes: 'Self-hosted bookmark manager\n\nTry the Docker image.',
			tags: ['selfhosted', 'tools']
		});
		expect(all.find((l) => l.url === 'https://example.org/archived')).toMatchObject({
			archived: true,
			tags: ['old']
		});
	});

	it('pocket.csv: archive becomes status done; trackers dropped; the hostname stands in for no title', async () => {
		const res = await importAs(alice, fixture('pocket.csv'));
		expect(res.body.failures).toEqual([
			{ line: 7, reason: 'Not a web address (ftp://example.com/file).' },
			{ line: 8, reason: 'A row with no address.' }
		]);
		expect(seen(alice.id).map((l) => [l.url, l.title, l.status, l.tags])).toEqual([
			['https://example.com/pocket-1', 'Example Domain', null, ['dupe']],
			['https://example.com/pocket-2', 'Quoted, with a comma', 'done', ['later', 'reading']],
			['https://example.com/pocket-3', 'A "quoted" title over two lines', null, ['later']],
			['https://example.com/pocket-4', 'example.com', 'done', []]
		]);
		const untitled = userLinks(alice.id).find((l) => l.url.endsWith('pocket-4'))!;
		expect(JSON.parse(untitled.userSet)).toEqual([]);
		const titled = userLinks(alice.id).find((l) => l.url.endsWith('pocket-1'))!;
		expect(JSON.parse(titled.userSet)).toEqual(['title']);
	});

	it('skips an address already saved, and reuses tags and projects that exist (a project by name, any case)', async () => {
		const tag = createTag(t.db, syncWrite, alice.id, { name: 'docs' }).tag;
		const project = createProject(t.db, syncWrite, alice.id, { name: 'recipes' });
		const saved = saveLink(t.db, syncWrite, alice.id, { url: 'https://regex101.com' }).link;
		const res = await importAs(alice, fixture('firefox.html'));
		expect(res.body).toMatchObject({ added: 3, duplicates: 2, failed: 1 });
		expect(userLinks(alice.id)).toHaveLength(4);
		expect(listTags(t.db, alice.id).map((x) => x.name)).toEqual(['baking', 'docs', 'web']);
		expect(listTags(t.db, alice.id).find((x) => x.name === 'docs')!.id).toBe(tag.id);
		expect(listProjects(t.db, alice.id).map((p) => p.id)).toEqual([project.id]);
		expect(userLinks(alice.id).find((l) => l.id === saved.id)!.savedVia).toBe('paste');
		const mdn = seen(alice.id).find((l) => l.url === 'https://developer.mozilla.org/en-US/')!;
		expect(mdn.tags).toEqual(['docs', 'web']);
	});

	it("writes only the caller's rows: bob's tags, projects and links are never read or touched", async () => {
		createTag(t.db, syncWrite, bob.id, { name: 'baking' });
		createProject(t.db, syncWrite, bob.id, { name: 'Recipes' });
		saveLink(t.db, syncWrite, bob.id, { url: 'https://cooking.example.com/bread' });
		const bobBefore = JSON.stringify(seen(bob.id));
		const bobVersion = version(bob.id);
		const res = await importAs(alice, fixture('firefox.html'));
		expect(res.body.added).toBe(4);
		expect(JSON.stringify(seen(bob.id))).toBe(bobBefore);
		expect(version(bob.id)).toBe(bobVersion);
		const aliceTags = t.db.select().from(tags).where(eq(tags.userId, alice.id)).all();
		expect(aliceTags.map((x) => x.name).sort()).toEqual(['baking', 'dev', 'docs', 'regex', 'web']);
		const aliceProjects = t.db.select().from(projects).where(eq(projects.userId, alice.id)).all();
		expect(aliceProjects.map((p) => p.name).sort()).toEqual(['Recipes', 'Tools']);
	});

	it('is refused when signed out, and for a body a cross-site form could send', async () => {
		expect((await importAs(null, fixture('chrome.html'))).status).toBe(401);
		for (const type of [
			'text/plain',
			'multipart/form-data; boundary=x',
			'application/x-www-form-urlencoded'
		]) {
			const res = await importAs(alice, fixture('chrome.html'), type);
			expect(res.status).toBe(415);
		}
		for (const type of ['text/html', 'text/csv; charset=utf-8']) {
			expect((await importAs(alice, fixture('pocket-cursor.csv'), type)).status).toBe(200);
		}
	});

	it('refuses malformed, oversized and non-bookmark files with a message, and writes nothing', async () => {
		const cases: [BodyInit, number, RegExp][] = [
			[new Uint8Array(20 * 1024 * 1024 + 10).fill(0x41), 413, /over 20 MB/],
			[
				'<!doctype html><title>A page</title><a href="https://x.y">x</a>',
				400,
				/not a bookmarks file/
			],
			['{"format":"linksink.export/1","links":[]}', 400, /not a bookmarks file/],
			[new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), 400, /not a bookmarks file/],
			[
				'<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Empty</H3><DL><p></DL><p></DL>',
				400,
				/no links/
			],
			['title,url,time_added\n"never closed,https://a.example,1\n', 400, /never closes/],
			['', 400, /empty/]
		];
		for (const [body, status, message] of cases) {
			const before = snapshot(t.db);
			const res = await importAs(alice, body);
			expect(res.status).toBe(status);
			expect(res.body.error).toMatch(message);
			expect(res.changed).toBe(0);
			expect(snapshot(t.db).versions).toEqual(before.versions);
		}
		expect(userLinks(alice.id)).toHaveLength(0);
		expect(kicks).toBe(0);
	});

	it('refuses a body announced over 20 MB before reading it', async () => {
		const res = await api.import(
			alice,
			upload('small', 'application/octet-stream', { 'content-length': String(21 * 1024 * 1024) })
		);
		expect(res.status).toBe(413);
	});
});

function bigFile(n: number, offset = 0) {
	let html =
		'<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n';
	for (let f = 0; f < 10; f++) {
		html += `<DT><H3 ADD_DATE="1600000000">Folder ${f}</H3>\n<DL><p>\n`;
		for (let i = f; i < n; i += 10) {
			html += `<DT><A HREF="https://site${(i + offset) % 97}.example.com/page/${i + offset}" ADD_DATE="${1600000000 + i}" TAGS="t${i % 13},t${i % 7}">Page ${i + offset}</A>\n<DD>Note ${i}\n`;
		}
		html += '</DL><p>\n';
	}
	return html + '</DL><p>\n';
}

describe('batches and speed', () => {
	it('writes through syncWrite in batches of 500: 1,201 new links take 3 versions', async () => {
		const res = await importAs(alice, bigFile(1201));
		expect(res.body.added).toBe(1201);
		expect(version(alice.id)).toBe(3);
		const perVersion = new Map<number, number>();
		for (const l of userLinks(alice.id))
			perVersion.set(l.version, (perVersion.get(l.version) ?? 0) + 1);
		expect([...perVersion.values()]).toEqual([500, 500, 201]);
	});

	it('imports a 5,000-link file in under 10 s', async () => {
		const file = bigFile(5000);
		const started = performance.now();
		const res = await importAs(alice, file);
		const ms = performance.now() - started;
		process.stderr.write(
			`[timing] 5,000-link import (${(file.length / 1e6).toFixed(2)} MB): ${ms.toFixed(0)} ms\n`
		);
		expect(res.body).toMatchObject({ added: 5000, duplicates: 0, failed: 0 });
		expect(userLinks(alice.id)).toHaveLength(5000);
		expect(ms).toBeLessThan(10_000);
	}, 30_000);
});

describe('background details', () => {
	it('every new link gets its details through the feeder, never more than 2 fetches at once', async () => {
		let running = 0;
		let most = 0;
		const done: string[] = [];
		const queue = createFetchQueue({
			onRoom: () => feeder.fill(),
			work: async (id) => {
				running++;
				most = Math.max(most, running);
				await new Promise((r) => setTimeout(r, 2));
				t.db.update(links).set({ metaState: 'ok' }).where(eq(links.id, id)).run();
				running--;
				done.push(id);
			},
			onGiveUp: () => {}
		});
		const feeder = createFeeder({
			queue,
			next: (after, limit, exclude) => nextPending(t.db, after, limit, exclude)
		});
		const result = await importItems(
			t.db,
			syncWrite,
			alice.id,
			Array.from({ length: 40 }, (_, i) => item(`https://q.example.com/${i}`))
		);
		feeder.kick();
		await queue.idle();
		expect(most).toBe(2);
		expect(done.sort()).toEqual([...result.addedIds].sort());
	});
});

function item(url: string, extra: Partial<ImportItem> = {}): ImportItem {
	return {
		url,
		title: null,
		tags: [],
		projects: [],
		createdAt: null,
		notes: null,
		status: null,
		archived: false,
		line: 1,
		...extra
	};
}

describe('names', () => {
	it('cuts a tag or project name to 64 characters, and drops one that is only spaces', async () => {
		const long = 'x'.repeat(80);
		await importItems(t.db, syncWrite, alice.id, [
			item('https://n.example.com', { tags: [long, '  '], projects: [long] })
		]);
		expect(listTags(t.db, alice.id).map((x) => x.name)).toEqual(['x'.repeat(64)]);
		expect(listProjects(t.db, alice.id).map((x) => x.name)).toEqual(['x'.repeat(64)]);
	});
});

describe('GET /api/export.html and /api/export.json', () => {
	function seed() {
		const reading = createProject(t.db, syncWrite, alice.id, { name: 'Reading & <notes>' });
		const work = createProject(t.db, syncWrite, alice.id, { name: 'Work' });
		const ai = createTag(t.db, syncWrite, alice.id, { name: 'ai' }).tag;
		const recs = createTag(t.db, syncWrite, alice.id, { name: 'recommendations' }).tag;
		const both = saveLink(t.db, syncWrite, alice.id, {
			url: 'https://example.com/both?a=1&b="2"',
			title: 'In <both> & "quoted"',
			tagIds: [ai.id, recs.id],
			projectIds: [reading.id, work.id]
		}).link;
		patchLink(t.db, syncWrite, alice.id, both.id, { notes: 'Line one\n<script>x</script>' });
		const loose = saveLink(t.db, syncWrite, alice.id, {
			url: 'https://example.com/loose',
			title: 'Loose'
		}).link;
		const archived = saveLink(t.db, syncWrite, alice.id, {
			url: 'https://example.com/old',
			title: 'Old'
		}).link;
		patchLink(t.db, syncWrite, alice.id, archived.id, { archived: true, status: 'done' });
		const gone = saveLink(t.db, syncWrite, alice.id, {
			url: 'https://example.com/gone',
			title: 'Gone'
		}).link;
		deleteLink(syncWrite, alice.id, gone.id);
		saveLink(t.db, syncWrite, bob.id, { url: 'https://bob.example.com/secret', title: 'Bob only' });
		createProject(t.db, syncWrite, bob.id, { name: 'Bob project' });
		createTag(t.db, syncWrite, bob.id, { name: 'bobtag' });
		return { both, loose, archived, gone };
	}

	it('are refused when signed out', async () => {
		expect(api.exportHtml(null).status).toBe(401);
		expect(api.exportJson(null).status).toBe(401);
	});

	it('HTML: a folder per project (a link in two is in both), the rest at the top, TAGS, dates, notes as <DD>, escaped', async () => {
		const { both } = seed();
		const res = api.exportHtml(alice);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(res.headers.get('content-disposition')).toMatch(
			/^attachment; filename="linksink-bookmarks-\d{4}-\d\d-\d\d\.html"$/
		);
		const html = await res.text();
		const s = (ms: number) => Math.floor(ms / 1000);
		const line =
			`<DT><A HREF="https://example.com/both?a=1&amp;b=%222%22" ADD_DATE="${s(both.createdAt)}" LAST_MODIFIED="${s(linksJson(t.db, alice.id, userLinks(alice.id)).find((l) => l.id === both.id)!.updatedAt)}" TAGS="ai,recommendations">In &lt;both&gt; &amp; &quot;quoted&quot;</A>\n` +
			'        <DD>Line one\n&lt;script&gt;x&lt;/script&gt;\n';
		expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>\n')).toBe(true);
		expect(html).toMatch(
			/<DT><H3 ADD_DATE="\d+" LAST_MODIFIED="\d+">Reading &amp; &lt;notes&gt;<\/H3>\n {4}<DL><p>\n {8}/
		);
		expect(html.split(line)).toHaveLength(3);
		expect(html).toContain('<H3 ADD_DATE');
		expect(html).toMatch(
			/\n {4}<DT><A HREF="https:\/\/example.com\/loose" ADD_DATE="\d+" LAST_MODIFIED="\d+">Loose<\/A>\n/
		);
		expect(html).toContain('>Old</A>');
		expect(html).not.toContain('gone');
		expect(html).not.toContain('Bob');
		expect(html).not.toContain('<script>');
	});

	it('JSON: linksink.export/1 with every live link (archived too) and all its fields; nothing of bob', async () => {
		const { both, archived } = seed();
		const res = api.exportJson(alice);
		expect(res.headers.get('content-disposition')).toMatch(/linksink-export-\d{4}-\d\d-\d\d\.json/);
		const body = await res.json();
		expect(body.format).toBe('linksink.export/1');
		expect(body.links.map((l: { url: string }) => l.url).sort()).toEqual([
			'https://example.com/both?a=1&b=%222%22',
			'https://example.com/loose',
			'https://example.com/old'
		]);
		const one = body.links.find((l: { id: string }) => l.id === both.id);
		const columns = Object.keys(
			t.db.select().from(links).where(eq(links.id, both.id)).get()!
		).filter((c) => c !== 'userId');
		for (const c of columns) expect(one).toHaveProperty(c);
		expect(one).toMatchObject({
			notes: 'Line one\n<script>x</script>',
			tags: ['ai', 'recommendations'],
			projects: ['Reading & <notes>', 'Work'],
			savedVia: 'paste',
			userSet: ['title']
		});
		expect(one.tagIds).toHaveLength(2);
		expect(body.links.find((l: { id: string }) => l.id === archived.id)).toMatchObject({
			status: 'done'
		});
		expect(body.links.find((l: { id: string }) => l.id === archived.id).archivedAt).toBeGreaterThan(
			0
		);
		expect(body.tags.map((x: { name: string }) => x.name)).toEqual(['ai', 'recommendations']);
		expect(body.projects.map((x: { name: string }) => x.name)).toEqual([
			'Reading & <notes>',
			'Work'
		]);
		expect(Array.isArray(body.sources)).toBe(true);
		const text = JSON.stringify(body);
		expect(text).not.toContain('bob');
		expect(text).not.toContain('Bob');
		expect(text).not.toContain('gone');
		const bobs = await api.exportJson(bob).json();
		expect(bobs.links.map((l: { url: string }) => l.url)).toEqual([
			'https://bob.example.com/secret'
		]);
	});

	it('round trip: the HTML export imported into a fresh account gives the same links, tags, projects, notes and dates', async () => {
		seed();
		const carol = { id: addUser(t.db, 'carol') };
		const html = await api.exportHtml(alice).text();
		const res = await importAs(carol, html, 'text/html');
		// "both" is in two folders: once added, once a duplicate whose folder joins it.
		expect(res.body).toMatchObject({ added: 3, duplicates: 1, failed: 0 });
		const trim = (rows: ReturnType<typeof seen>) =>
			rows.map((r) => ({
				...r,
				status: undefined,
				archived: undefined,
				createdAt: Math.floor(r.createdAt / 1000)
			}));
		expect(trim(seen(carol.id))).toEqual(trim(seen(alice.id)));
		const again = await importAs(carol, html, 'text/html');
		expect(again.body).toMatchObject({ added: 0, duplicates: 4 });
	});
});
