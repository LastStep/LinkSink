// T-0019: the import preview (nothing written), each folder's default choice, the two switches, the mapping applied
// by the writer, and the mapping checked on the server.
import { readFileSync } from 'node:fs';
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { linkProjects, links, syncMeta } from '../db/schema.ts';
import { linksJson } from '../links.ts';
import { createProject, listProjects, listTags } from '../organise.ts';
import { createSyncWrite, type SyncWrite } from '../sync/write.ts';
import { addUser, tempDatabase } from '../test/db.ts';
import { snapshot } from '../test/synced.ts';
import { createImportApi, IMPORT_WITH_OPTIONS, type ImportApi } from './api.ts';
import { importItems, parseImport } from './index.ts';
import type { ImportItem } from './types.ts';
import { folderKey, foldersOf, type FolderChoice } from './mapping.ts';

let t: ReturnType<typeof tempDatabase>;
let syncWrite: SyncWrite;
let api: ImportApi;
let alice: { id: string };
let bob: { id: string };

beforeEach(() => {
	t = tempDatabase();
	syncWrite = createSyncWrite(t.db);
	api = createImportApi({ db: t.db, syncWrite });
	alice = { id: addUser(t.db, 'alice') };
	bob = { id: addUser(t.db, 'bob') };
});
afterEach(() => t.close());

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

const post = (body: BodyInit, type: string, preview = false) =>
	new Request(`http://localhost/api/import${preview ? '?preview' : ''}`, {
		method: 'POST',
		headers: { 'content-type': type },
		body
	});

async function preview(who: { id: string } | null, file: BodyInit) {
	const res = await api.preview(who, post(file, 'application/octet-stream', true));
	return { status: res.status, body: await res.json() };
}

/** The file with its options line in front, as the Settings screen sends it. */
function withOptions(options: unknown, file: string | Buffer) {
	return Buffer.concat([
		Buffer.from(typeof options === 'string' ? options : JSON.stringify(options)),
		Buffer.from('\n'),
		typeof file === 'string' ? Buffer.from(file) : file
	]);
}

async function importMapped(who: { id: string }, options: unknown, file: string | Buffer) {
	const res = await api.import(who, post(withOptions(options, file), IMPORT_WITH_OPTIONS));
	return { status: res.status, body: await res.json() };
}

/** Every table's row count, and every synced row with its version: equal before and after means nothing was written. */
function everything() {
	const names = t.db.$client
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
		.all() as { name: string }[];
	const counts = Object.fromEntries(
		names.map(({ name }) => [
			name,
			(t.db.$client.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n
		])
	);
	const snap = snapshot(t.db);
	return { counts, rows: [...snap.rows.entries()], versions: [...snap.versions.entries()] };
}

/** The user's links as a person sees them: address, tag and project names, status. */
function seen(userId: string) {
	const tagNames = new Map(listTags(t.db, userId).map((x) => [x.id, x.name]));
	const projectNames = new Map(listProjects(t.db, userId).map((x) => [x.id, x.name]));
	const rows = t.db
		.select()
		.from(links)
		.where(and(eq(links.userId, userId), isNull(links.deletedAt)))
		.all();
	return linksJson(t.db, userId, rows)
		.map((l) => ({
			url: l.url,
			tags: l.tagIds.map((id) => tagNames.get(id)).sort(),
			projects: l.projectIds.map((id) => projectNames.get(id)).sort(),
			status: l.status
		}))
		.sort((a, b) => a.url.localeCompare(b.url));
}

const version = (userId: string) =>
	t.db.select().from(syncMeta).where(eq(syncMeta.userId, userId)).get()?.version ?? 0;

const key = (...path: string[]) => folderKey(path);

describe('defaults', () => {
	const none = { kind: 'none' };
	const make = (name: string) => ({ kind: 'new', name });
	// [fixture, [path, count, default]]: the browser's own top folders start on No project, the rest on New project
	// named after the folder (nested names joined with " / ", the container left out).
	const table: [string, [string[], number, FolderChoice][]][] = [
		[
			'chrome.html',
			[
				[['Bookmarks bar'], 1, none as FolderChoice],
				[
					['Bookmarks bar', 'Reading', 'Long reads'],
					1,
					make('Reading / Long reads') as FolderChoice
				],
				[['Bookmarks bar', 'Reading'], 1, make('Reading') as FolderChoice],
				// Chrome writes Other bookmarks with no attribute: known by its name at the top.
				[['Other bookmarks'], 1, none as FolderChoice]
			]
		],
		[
			'firefox.html',
			[
				[['Recipes'], 1, make('Recipes') as FolderChoice],
				[['Bookmarks Toolbar'], 1, none as FolderChoice],
				[['Bookmarks Toolbar', 'Tools'], 1, make('Tools') as FolderChoice],
				[['Other Bookmarks'], 1, none as FolderChoice]
			]
		],
		[
			'raindrop.html',
			[
				[
					['Parent Folder', 'Child Folder'],
					2,
					make('Parent Folder / Child Folder') as FolderChoice
				],
				[['Parent Folder'], 1, make('Parent Folder') as FolderChoice],
				// Raindrop's own Unsorted collection: links that were in no collection there land in Unsorted here.
				[['Unsorted'], 1, none as FolderChoice]
			]
		]
	];
	it.each(table)('%s', (name, want) => {
		const folders = foldersOf(parseImport(fixture(name)).items, new Map());
		expect(folders.map((f) => [f.path, f.count, f.suggested])).toEqual(want);
		expect(folders.map((f) => f.key)).toEqual(want.map(([path]) => folderKey(path)));
	});

	it('Bookmarks Menu and Mobile bookmarks at the top start on No project; a folder inside one is named without it', () => {
		const file = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
<DT><H3>Bookmarks Menu</H3>
<DL><p><DT><A HREF="https://a.example.com">a</A>
<DT><H3>Mobile</H3><DL><p><DT><A HREF="https://b.example.com">b</A></DL><p>
</DL><p>
<DT><H3>Mobile bookmarks</H3>
<DL><p><DT><A HREF="https://c.example.com">c</A></DL><p>
<DT><H3>Work</H3>
<DL><p><DT><H3>Mobile</H3><DL><p><DT><A HREF="https://d.example.com">d</A></DL><p></DL><p>
</DL><p>`;
		const folders = foldersOf(parseImport(Buffer.from(file)).items, new Map());
		expect(folders.map((f) => [f.path.join(' › '), f.suggested, f.container])).toEqual([
			['Bookmarks Menu', { kind: 'none' }, true],
			// Only a top folder is a container by name: "Mobile" inside the menu is the person's own.
			['Bookmarks Menu › Mobile', { kind: 'new', name: 'Mobile' }, false],
			['Mobile bookmarks', { kind: 'none' }, true],
			['Work › Mobile', { kind: 'new', name: 'Work / Mobile' }, false]
		]);
	});

	it('a folder named as an existing project (any case) starts on that project', async () => {
		const reading = createProject(t.db, syncWrite, alice.id, { name: 'reading' });
		createProject(t.db, syncWrite, bob.id, { name: 'Tools' });
		const { body } = await preview(alice, fixture('chrome.html'));
		expect(
			body.folders.find((f: { key: string }) => f.key === key('Bookmarks bar', 'Reading'))
		).toMatchObject({
			suggested: { kind: 'existing', projectId: reading.id }
		});
		// Bob's project of the same name is never offered to Alice.
		const ff = await preview(alice, fixture('firefox.html'));
		expect(
			ff.body.folders.find((f: { key: string }) => f.key === key('Bookmarks Toolbar', 'Tools'))
				.suggested
		).toEqual({ kind: 'new', name: 'Tools' });
	});

	it('a file nested 2,000 deep: folders past 32 fold into the one at 32, quickly', () => {
		let file = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n';
		for (let i = 0; i < 2000; i++) file += `<DT><H3>d${i}</H3>\n<DL><p>\n`;
		file += '<DT><A HREF="https://deep.example.com">deep</A>\n';
		for (let i = 0; i < 2000; i++) file += '</DL><p>\n';
		const started = performance.now();
		const folders = foldersOf(parseImport(Buffer.from(file)).items, new Map());
		expect(performance.now() - started).toBeLessThan(1000);
		expect(folders).toHaveLength(1);
		expect(folders[0].path).toHaveLength(32);
		expect(folders[0].path.at(-1)).toBe('d31');
		expect(folders[0].suggested).toEqual({
			kind: 'new',
			name: Array.from({ length: 32 }, (_, i) => `d${i}`)
				.join(' / ')
				.slice(0, 64)
				.trim()
		});
	});

	it('a default name over 64 characters is cut to 64', () => {
		const long = 'f'.repeat(40);
		const file = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>${long}</H3><DL><p><DT><H3>${long}</H3><DL><p><DT><A HREF="https://a.example.com">a</A></DL><p></DL><p></DL><p>`;
		const [folder] = foldersOf(parseImport(Buffer.from(file)).items, new Map());
		expect(folder.suggested).toEqual({ kind: 'new', name: `${long} / ${long}`.slice(0, 64) });
	});
});

describe('POST /api/import?preview', () => {
	it('shows links, duplicates, unreadable lines and folders, and writes nothing', async () => {
		// Alice already has one of the file's links, and a project.
		await importMapped(
			alice,
			{ mapping: {} },
			'<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><A HREF="https://my-link-1.com">x</A></DL><p>'
		);
		createProject(t.db, syncWrite, alice.id, { name: 'Elsewhere' });
		const before = everything();
		const { status, body } = await preview(alice, fixture('raindrop.html'));
		expect(status).toBe(200);
		expect(everything()).toEqual(before);
		expect(body).toMatchObject({
			format: 'netscape',
			formatLabel: 'Bookmarks file (HTML)',
			links: 4,
			// my-link-2 twice in the file, my-link-1 already saved.
			duplicates: 2,
			adding: 2,
			unreadable: 0,
			loose: 0,
			tags: ['second tag', 'tag1', 'tag3'],
			pocketRead: false
		});
		expect(body.folders).toHaveLength(3);
	});

	it('counts the lines that could not be read, and links at the top of the file', async () => {
		const before = everything();
		const { body } = await preview(alice, fixture('firefox.html'));
		expect(everything()).toEqual(before);
		// place: is not a web link; MDN twice (one with a trailing slash).
		expect(body).toMatchObject({ links: 5, duplicates: 1, adding: 4, unreadable: 1, loose: 1 });
		expect(body.failures).toEqual([
			{ line: 18, reason: expect.stringMatching(/^Not a web address/) }
		]);
	});

	it('marks a Pocket file, whose read state can become Done', async () => {
		const { body } = await preview(alice, fixture('pocket.csv'));
		expect(body).toMatchObject({ format: 'pocket-csv', pocketRead: true, folders: [] });
	});

	it('is refused signed out, for a form-sendable body, and for a file that is not bookmarks', async () => {
		expect((await preview(null, fixture('chrome.html'))).status).toBe(401);
		const form = await api.preview(
			alice,
			post(fixture('chrome.html'), 'multipart/form-data', true)
		);
		expect(form.status).toBe(415);
		const page = await preview(alice, '<!doctype html><p>hi</p>');
		expect(page.status).toBe(400);
		expect(page.body.error).toMatch(/not a bookmarks file/);
	});

	it('takes under 3 s on a 5,000-link file', async () => {
		// Half of them already saved, so the duplicate check finds something.
		const file = bigFile(5000);
		await api.import(alice, post(bigFile(2500), 'application/octet-stream'));
		const before = everything();
		const started = performance.now();
		const { body } = await preview(alice, file);
		const ms = performance.now() - started;
		process.stderr.write(
			`[timing] 5,000-link preview (${(file.length / 1e6).toFixed(2)} MB, 2,500 saved): ${ms.toFixed(0)} ms\n`
		);
		expect(body).toMatchObject({ links: 5000, duplicates: 2500, adding: 2500 });
		expect(body.folders).toHaveLength(10);
		expect(everything()).toEqual(before);
		expect(ms).toBeLessThan(3000);
	}, 30_000);
});

function bigFile(n: number) {
	let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<H1>Bookmarks</H1>\n<DL><p>\n';
	for (let f = 0; f < 10; f++) {
		html += `<DT><H3>Folder ${f}</H3>\n<DL><p>\n`;
		for (let i = f; i < n; i += 10) {
			html += `<DT><A HREF="https://site${i % 97}.example.com/page/${i}" TAGS="t${i % 13}">Page ${i}</A>\n`;
		}
		html += '</DL><p>\n';
	}
	return html + '</DL><p>\n';
}

describe('POST /api/import with a mapping', () => {
	const chrome = () => fixture('chrome.html');

	it('new (renamed), existing, tag and none: each written as chosen; a link in no project lands in Unsorted', async () => {
		const reading = createProject(t.db, syncWrite, alice.id, { name: 'Reading list' });
		const res = await importMapped(
			alice,
			{
				mapping: {
					[key('Bookmarks bar')]: { kind: 'none' },
					[key('Bookmarks bar', 'Reading')]: { kind: 'existing', projectId: reading.id },
					[key('Bookmarks bar', 'Reading', 'Long reads')]: { kind: 'tag', name: 'Long Reads' },
					[key('Other bookmarks')]: { kind: 'new', name: 'Code' }
				}
			},
			chrome()
		);
		expect(res.status).toBe(200);
		// One project made (Code); the existing one is joined, not counted.
		expect(res.body).toMatchObject({ added: 4, duplicates: 0, failed: 1, projectsMade: 1 });
		expect(seen(alice.id)).toEqual([
			{ url: 'https://github.com/sveltejs/kit', tags: [], projects: ['Code'], status: null },
			{
				url: 'https://news.example.org/item/1',
				tags: [],
				projects: ['Reading list'],
				status: null
			},
			{ url: 'https://svelte.dev/docs', tags: [], projects: [], status: null },
			{ url: 'https://www.example.com/essay', tags: ['long reads'], projects: [], status: null }
		]);
		// The existing project is reused, not copied; one new project made.
		expect(
			listProjects(t.db, alice.id)
				.map((p) => p.name)
				.sort()
		).toEqual(['Code', 'Reading list']);
	});

	it('a folder the mapping leaves out gets its default; two folders mapped to one new name share one project', async () => {
		await importMapped(
			alice,
			{
				mapping: {
					[key('Bookmarks bar', 'Reading')]: { kind: 'new', name: 'Shelf' },
					[key('Bookmarks bar', 'Reading', 'Long reads')]: { kind: 'new', name: 'shelf' }
				}
			},
			chrome()
		);
		expect(seen(alice.id).map((l) => [l.url, l.projects])).toEqual([
			['https://github.com/sveltejs/kit', []],
			['https://news.example.org/item/1', ['shelf']],
			['https://svelte.dev/docs', []],
			['https://www.example.com/essay', ['shelf']]
		]);
		// The name first met in the file (Long reads comes before Reading's own link) is the one kept.
		expect(listProjects(t.db, alice.id).map((p) => p.name)).toEqual(['shelf']);
	});

	it('copies of a link in two folders keep both folders’ choices', async () => {
		const work = createProject(t.db, syncWrite, alice.id, { name: 'Work' });
		await importMapped(
			alice,
			{
				mapping: {
					[key('Parent Folder', 'Child Folder')]: { kind: 'existing', projectId: work.id },
					[key('Unsorted')]: { kind: 'tag', name: 'later' }
				}
			},
			fixture('raindrop.html')
		);
		expect(seen(alice.id).find((l) => l.url === 'https://my-link-2.com/page')).toEqual({
			url: 'https://my-link-2.com/page',
			tags: ['later', 'second tag', 'tag1', 'tag3'],
			projects: ['Work'],
			status: null
		});
	});

	it('keep the file’s tags: on keeps them, off drops them (a folder-as-tag still applies)', async () => {
		await importMapped(
			alice,
			{ keepTags: false, mapping: { [key('Recipes')]: { kind: 'tag', name: 'food' } } },
			fixture('firefox.html')
		);
		expect(seen(alice.id).map((l) => [l.url, l.tags])).toEqual([
			['https://cooking.example.com/bread', ['food']],
			['https://developer.mozilla.org/en-US/', []],
			['https://regex101.com/', []],
			['https://www.mozilla.org/en-US/firefox/', []]
		]);
		await importMapped(bob, { keepTags: true }, fixture('firefox.html'));
		expect(seen(bob.id).find((l) => l.url === 'https://regex101.com/')?.tags).toEqual([
			'dev',
			'regex'
		]);
	});

	it('Pocket’s read state: on, archive becomes Done; off, no status', async () => {
		await importMapped(alice, { pocketReadDone: true }, fixture('pocket.csv'));
		await importMapped(bob, { pocketReadDone: false }, fixture('pocket.csv'));
		const done = (userId: string) => seen(userId).filter((l) => l.status === 'done').length;
		expect(done(alice.id)).toBeGreaterThan(0);
		expect(done(bob.id)).toBe(0);
		expect(seen(bob.id)).toHaveLength(seen(alice.id).length);
	});

	it('writes through syncWrite in batches of 500', async () => {
		const res = await importMapped(
			alice,
			{ mapping: { [key('Folder 0')]: { kind: 'tag', name: 'zero' } } },
			bigFile(1201)
		);
		expect(res.body.added).toBe(1201);
		// Nine folders made nine projects, across three batches.
		expect(res.body.projectsMade).toBe(9);
		expect(version(alice.id)).toBe(3);
		expect(listProjects(t.db, alice.id)).toHaveLength(9);
	});
});

describe('the mapping is checked on the server', () => {
	const chrome = () => fixture('chrome.html');
	const refusals: [string, () => unknown, RegExp][] = [
		[
			'another user’s project',
			() => ({
				mapping: { [key('Other bookmarks')]: { kind: 'existing', projectId: bobsProject } }
			}),
			/not one of yours/
		],
		[
			'an unknown project id',
			() => ({
				mapping: {
					[key('Other bookmarks')]: { kind: 'existing', projectId: '01JUNKJUNKJUNKJUNKJUNKJUNK' }
				}
			}),
			/not one of yours/
		],
		[
			'a deleted project',
			() => ({
				mapping: { [key('Other bookmarks')]: { kind: 'existing', projectId: alicesDeleted } }
			}),
			/not one of yours/
		],
		[
			'a path not in the file',
			() => ({ mapping: { [key('Nope')]: { kind: 'none' } } }),
			/not in this file/
		],
		[
			'a path that is only a prefix of one in the file',
			() => ({
				mapping: { [key('Bookmarks bar', 'Reading', 'Long reads', 'More')]: { kind: 'none' } }
			}),
			/not in this file/
		],
		[
			'an overlong project name',
			() => ({ mapping: { [key('Other bookmarks')]: { kind: 'new', name: 'x'.repeat(65) } } }),
			/at most 64/
		],
		[
			'an overlong tag name',
			() => ({ mapping: { [key('Other bookmarks')]: { kind: 'tag', name: 'x'.repeat(65) } } }),
			/at most 64/
		],
		[
			'an empty name',
			() => ({ mapping: { [key('Other bookmarks')]: { kind: 'new', name: '   ' } } }),
			/needs a name/
		],
		[
			'an unknown choice',
			() => ({ mapping: { [key('Other bookmarks')]: { kind: 'folder' } } }),
			/new project/
		],
		['a mapping that is a list', () => ({ mapping: [] }), /not readable/],
		['a switch that is not true or false', () => ({ keepTags: 'yes' }), /true or false/],
		['options that are not JSON', () => '{mapping:', /not readable/]
	];
	let bobsProject: string;
	let alicesDeleted: string;
	beforeEach(() => {
		bobsProject = createProject(t.db, syncWrite, bob.id, { name: 'Bob’s' }).id;
		alicesDeleted = createProject(t.db, syncWrite, alice.id, { name: 'Gone' }).id;
		t.db.$client.prepare('UPDATE projects SET deleted_at = 1 WHERE id = ?').run(alicesDeleted);
	});

	it.each(refusals)('%s: 400, nothing written', async (_, options, message) => {
		const before = everything();
		const res = await importMapped(alice, options(), chrome());
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(message);
		expect(everything()).toEqual(before);
	});

	it('an options line with no file after it, or none at all, is refused', async () => {
		const before = everything();
		const noLine = await api.import(
			alice,
			post(JSON.stringify({ mapping: {} }), IMPORT_WITH_OPTIONS)
		);
		expect(noLine.status).toBe(400);
		const noFile = await api.import(alice, post(withOptions({}, ''), IMPORT_WITH_OPTIONS));
		expect(noFile.status).toBe(400);
		expect((await noFile.json()).error).toMatch(/empty/);
		expect(everything()).toEqual(before);
	});
});

// Breakages the tests verifier (M-2026-10-25-c87249d5) applied that no test caught; each test below fails with its
// breakage in place.
describe('caught breakages', () => {
	it('a top folder marked as the browser’s own by its attribute, whatever its name, starts on No project', () => {
		// Names no list knows (a German browser): only PERSONAL_TOOLBAR_FOLDER and UNFILED_BOOKMARKS_FOLDER say so.
		const file = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
<DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Lesezeichenleiste</H3>
<DL><p><DT><A HREF="https://a.example.com">a</A>
<DT><H3>Rezepte</H3><DL><p><DT><A HREF="https://b.example.com">b</A></DL><p>
</DL><p>
<DT><H3 UNFILED_BOOKMARKS_FOLDER="true">Weitere Lesezeichen</H3>
<DL><p><DT><A HREF="https://c.example.com">c</A></DL><p>
</DL><p>`;
		const folders = foldersOf(parseImport(Buffer.from(file)).items, new Map());
		expect(folders.map((f) => [f.path.join(' › '), f.suggested, f.container])).toEqual([
			['Lesezeichenleiste', { kind: 'none' }, true],
			['Lesezeichenleiste › Rezepte', { kind: 'new', name: 'Rezepte' }, false],
			['Weitere Lesezeichen', { kind: 'none' }, true]
		]);
	});

	it('an existing project whose stored name has capitals matches its folder', async () => {
		const reading = createProject(t.db, syncWrite, alice.id, { name: 'READING' });
		const { body } = await preview(alice, fixture('chrome.html'));
		expect(
			body.folders.find((f: { key: string }) => f.key === key('Bookmarks bar', 'Reading')).suggested
		).toEqual({ kind: 'existing', projectId: reading.id });
	});

	const item = (url: string, extra: Partial<ImportItem> = {}): ImportItem => ({
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
	});

	it('the writer, called past the option checks, links no project of another user', async () => {
		const bobs = createProject(t.db, syncWrite, bob.id, { name: 'Bob’s' });
		const result = await importItems(t.db, syncWrite, alice.id, [
			item('https://x.example.com', { projectIds: [bobs.id] })
		]);
		expect(result.added).toBe(1);
		expect(
			t.db.select().from(linkProjects).where(eq(linkProjects.projectId, bobs.id)).all()
		).toEqual([]);
		expect(seen(alice.id)).toEqual([
			{ url: 'https://x.example.com/', tags: [], projects: [], status: null }
		]);
	});

	it('a later copy’s existing project joins the first copy', async () => {
		const work = createProject(t.db, syncWrite, alice.id, { name: 'Work' });
		await importItems(t.db, syncWrite, alice.id, [
			item('https://y.example.com/page'),
			item('https://y.example.com/page/', { projectIds: [work.id] })
		]);
		expect(seen(alice.id)).toEqual([
			{ url: 'https://y.example.com/page', tags: [], projects: ['Work'], status: null }
		]);
	});

	it('mapped through the API: the existing-project choice on the second copy of a link', async () => {
		const work = createProject(t.db, syncWrite, alice.id, { name: 'Work' });
		await importMapped(
			alice,
			{ mapping: { [key('Unsorted')]: { kind: 'existing', projectId: work.id } } },
			fixture('raindrop.html')
		);
		expect(seen(alice.id).find((l) => l.url === 'https://my-link-2.com/page')?.projects).toEqual([
			'Parent Folder / Child Folder',
			'Work'
		]);
	});
});

// T-0012's fix round 2 (b49f6c5): an import makes at most 1,000 new projects, and every upload stops at 20 MB.
describe('with T-0012’s limits', () => {
	/** A file with `n` folders of one link each. */
	function folders(n: number) {
		let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n';
		for (let f = 0; f < n; f++) {
			html += `<DT><H3>Folder ${f}</H3>\n<DL><p>\n<DT><A HREF="https://f${f}.example.com/">${f}</A>\n</DL><p>\n`;
		}
		return html + '</DL><p>\n';
	}

	it('a mapping’s new projects count toward the 1,000 cap; mapped elsewhere, they do not', async () => {
		const file = folders(1001);
		const before = everything();
		// Every folder on its default (New project): 1,001 new projects, refused before anything is written.
		const refused = await importMapped(alice, { mapping: {} }, file);
		expect(refused.status).toBe(400);
		expect(refused.body.error).toMatch(/1,001 new projects/);
		expect(everything()).toEqual(before);
		// Renamed so two folders share one new name: 1,000 new projects, allowed.
		const shared = await importMapped(
			alice,
			{ mapping: { [key('Folder 1000')]: { kind: 'new', name: 'Folder 0' } } },
			file
		);
		expect(shared.status).toBe(200);
		expect(shared.body).toMatchObject({ added: 1001, projectsMade: 1000 });
	}, 60_000);

	it('a folder mapped to a tag or to nothing makes no project toward the cap', async () => {
		const res = await importMapped(
			alice,
			{
				mapping: {
					[key('Folder 0')]: { kind: 'tag', name: 'zero' },
					[key('Folder 1')]: { kind: 'none' }
				}
			},
			folders(1002)
		);
		expect(res.status).toBe(200);
		expect(res.body.projectsMade).toBe(1000);
	}, 60_000);

	/** A request whose body streams in 64 KB chunks with no Content-Length, as a chunked upload arrives. */
	function streamed(url: string, type: string, bytes: number) {
		let sent = 0;
		const chunk = new Uint8Array(64 * 1024).fill(0x61);
		return new Request(url, {
			method: 'POST',
			headers: { 'content-type': type },
			body: new ReadableStream<Uint8Array>({
				pull(controller) {
					if (sent >= bytes) return controller.close();
					sent += chunk.length;
					controller.enqueue(chunk);
				}
			}),
			duplex: 'half'
		} as RequestInit);
	}

	it('the preview stops a chunked body over 20 MB with 413, as the import does', async () => {
		const before = everything();
		const preview = await api.preview(
			alice,
			streamed('http://localhost/api/import?preview', 'application/octet-stream', 21 * 1024 * 1024)
		);
		expect(preview.status).toBe(413);
		expect((await preview.json()).error).toMatch(/over 20 MB/);
		// An import with options may carry its options line on top of the 20 MB file, and no more.
		const mapped = await api.import(
			alice,
			streamed('http://localhost/api/import', IMPORT_WITH_OPTIONS, 21 * 1024 * 1024)
		);
		expect(mapped.status).toBe(413);
		expect(everything()).toEqual(before);
	});
});

// T-0012's fix round 4 (4fcd938): every raw field cut before any work on it, and at most 100,000 links per import.
describe('the preview under T-0012’s field limits and link cap', () => {
	it('a file of more than 100,000 links is refused by the preview, as by the import', async () => {
		let csv = 'title,url,time_added,tags,status\n';
		for (let i = 0; i <= 100_000; i++) csv += `,https://c.example.com/${i},,,\n`;
		const before = everything();
		const res = await preview(alice, csv);
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/more than 100,000 links/);
		expect(everything()).toEqual(before);
	}, 60_000);

	it('a folder heading of 1 MB is read only to its limit: the preview is quick and the name is cut to 64', async () => {
		const name = 'x'.repeat(1024 * 1024);
		const file = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>${name}</H3><DL><p><DT><A HREF="https://a.example.com">a</A></DL><p></DL><p>`;
		const started = performance.now();
		const { status, body } = await preview(alice, file);
		expect(performance.now() - started).toBeLessThan(2000);
		expect(status).toBe(200);
		expect(body.folders[0].path[0].length).toBeLessThanOrEqual(64);
		expect(body.folders[0].suggested).toEqual({ kind: 'new', name: 'x'.repeat(64) });
	});

	it('a mapping’s name of 100,000 U+FDFA (300 KB; NFKC makes each 18 long) is refused quickly, nothing written', async () => {
		const before = everything();
		const started = performance.now();
		const res = await importMapped(
			alice,
			{ mapping: { [key('Other bookmarks')]: { kind: 'tag', name: '\uFDFA'.repeat(100_000) } } },
			fixture('chrome.html')
		);
		expect(performance.now() - started).toBeLessThan(2000);
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/at most 64/);
		expect(everything()).toEqual(before);
	});

	it('a default name made of characters NFKC lengthens is cut to 64', () => {
		const folder = '\uFDFA'.repeat(60);
		const file = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>${folder}</H3><DL><p><DT><A HREF="https://a.example.com">a</A></DL><p></DL><p>`;
		const [f] = foldersOf(parseImport(Buffer.from(file)).items, new Map());
		expect(f.suggested.kind).toBe('new');
		expect((f.suggested as { name: string }).name.length).toBeLessThanOrEqual(64);
	});
});
