import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sniffFormat } from '../../import-format.ts';
import { parseImport } from './index.ts';
import { parseCsv } from './pocket.ts';
import { fileTime, ImportRefused } from './types.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const s = (seconds: number) => seconds * 1000;

type Row = {
	url: string;
	title: string | null;
	projects: string[];
	tags: string[];
	createdAt: number | null;
	notes?: string | null;
	status?: string | null;
	archived?: boolean;
};

// One table per fixture: every link the file holds, in file order, as the parser reads it (T-0012: folders become
// projects with nested names joined by " / ", TAGS become tags, ADD_DATE becomes created_at, <DD> becomes notes,
// Pocket's read state becomes status done).
const tables: Record<string, { format: string; rows: Row[]; failures?: number }> = {
	'chrome.html': {
		format: 'netscape',
		rows: [
			{
				url: 'https://svelte.dev/docs',
				title: 'Svelte docs',
				projects: [],
				tags: [],
				createdAt: s(1700000100)
			},
			{
				url: 'https://www.example.com/essay?utm_source=x',
				title: 'An essay & a <b>bold</b> claim',
				projects: ['Reading / Long reads'],
				tags: [],
				createdAt: s(1700000220)
			},
			{
				url: 'https://news.example.org/item/1',
				title: 'News item',
				projects: ['Reading'],
				tags: [],
				createdAt: s(1700000230)
			},
			{
				url: 'https://github.com/sveltejs/kit',
				title: 'SvelteKit',
				projects: ['Other bookmarks'],
				tags: [],
				createdAt: s(1700000410)
			},
			{
				url: 'chrome://settings/',
				title: 'Settings',
				projects: ['Other bookmarks'],
				tags: [],
				createdAt: s(1700000420)
			}
		]
	},
	'firefox.html': {
		format: 'netscape',
		rows: [
			{
				url: 'https://developer.mozilla.org/en-US/',
				title: 'MDN Web Docs',
				projects: [],
				tags: ['docs', 'web'],
				createdAt: s(1690000000)
			},
			{
				url: 'https://cooking.example.com/bread',
				title: 'Sourdough bread',
				projects: ['Recipes'],
				tags: ['baking'],
				createdAt: s(1690000210)
			},
			{
				url: 'place:sort=8&maxResults=10',
				title: 'Recently Used Tags',
				projects: [],
				tags: [],
				createdAt: s(1690000400)
			},
			{
				url: 'https://www.mozilla.org/en-US/firefox/',
				title: 'Get Firefox',
				projects: [],
				tags: [],
				createdAt: s(1690000510)
			},
			{
				url: 'https://regex101.com/',
				title: 'regex101',
				projects: ['Tools'],
				tags: ['dev', 'regex'],
				createdAt: s(1690000540)
			},
			{
				url: 'https://developer.mozilla.org/en-US',
				title: 'MDN again',
				projects: [],
				tags: [],
				createdAt: s(1690000710)
			}
		]
	},
	'raindrop.html': {
		format: 'netscape',
		rows: [
			{
				url: 'https://my-link-1.com',
				title: 'My Link 1',
				projects: ['Parent Folder / Child Folder'],
				tags: [],
				createdAt: s(1607944352)
			},
			{
				url: 'https://my-link-2.com/page',
				title: 'Test',
				projects: ['Parent Folder / Child Folder'],
				tags: ['tag1', 'second tag'],
				createdAt: s(1639247418)
			},
			{
				url: 'https://my-link-3.com',
				title: 'Link in the parent',
				projects: ['Parent Folder'],
				tags: ['tag1'],
				createdAt: s(1639247500)
			},
			{
				url: 'https://my-link-2.com/page/',
				title: 'Same page, saved twice',
				projects: ['Unsorted'],
				tags: ['tag3'],
				createdAt: s(1639247700)
			}
		]
	},
	'pinboard.html': {
		format: 'netscape',
		rows: [
			{
				url: 'https://pinboard.in/howto/',
				title: 'Pinboard: how to',
				projects: [],
				tags: ['pinboard', 'help'],
				createdAt: s(1500000000),
				notes: 'The help page, with the export formats listed.'
			},
			{
				url: 'https://blog.example.net/post/42',
				title: 'A post with <script>alert(1)</script> in its title',
				projects: [],
				tags: ['writing'],
				createdAt: s(1500000100),
				notes: 'Two lines of notes:\nsecond line, with <img src=x onerror=alert(1)> as text.'
			},
			{
				url: 'https://example.com/no-tags',
				title: 'No tags',
				projects: [],
				tags: [],
				createdAt: s(1500000200),
				notes: null
			}
		]
	},
	'linkding.html': {
		format: 'netscape',
		rows: [
			{
				url: 'https://linkding.link/',
				title: 'linkding',
				projects: [],
				tags: ['selfhosted', 'tools'],
				createdAt: s(1710000000),
				notes: 'Self-hosted bookmark manager\n\nTry the Docker image.',
				archived: false
			},
			{
				url: 'https://example.org/archived',
				title: 'An archived one',
				projects: [],
				tags: ['old'],
				createdAt: s(1710000200),
				notes: null,
				archived: true
			},
			{
				url: 'https://example.org/plain',
				title: 'Plain',
				projects: [],
				tags: [],
				createdAt: s(1710000400),
				notes: 'Only a description',
				archived: false
			}
		]
	},
	'pocket.csv': {
		format: 'pocket-csv',
		failures: 1,
		rows: [
			{
				url: 'https://example.com/pocket-1',
				title: 'Example Domain',
				projects: [],
				tags: [],
				createdAt: s(1600000000),
				status: null
			},
			{
				url: 'https://example.com/pocket-2',
				title: 'Quoted, with a comma',
				projects: [],
				tags: ['reading', 'later'],
				createdAt: s(1600000100),
				status: 'done'
			},
			{
				url: 'https://example.com/pocket-3',
				title: 'A "quoted" title over two lines',
				projects: [],
				tags: ['later'],
				createdAt: s(1600000200),
				status: null
			},
			{
				url: 'https://example.com/pocket-4?utm_medium=email',
				title: null,
				projects: [],
				tags: [],
				createdAt: s(1600000300),
				status: 'done'
			},
			{
				url: 'ftp://example.com/file',
				title: 'Not a link',
				projects: [],
				tags: [],
				createdAt: s(1600000400),
				status: null
			},
			{
				url: 'http://www.example.com/pocket-1/',
				title: 'Duplicate of the first',
				projects: [],
				tags: ['dupe'],
				createdAt: s(1600000600),
				status: 'done'
			}
		]
	},
	'pocket-cursor.csv': {
		format: 'pocket-csv',
		rows: [
			{
				url: 'https://example.com/cursor',
				title: 'With a cursor column',
				projects: [],
				tags: ['one', 'two'],
				createdAt: s(1600000000),
				status: 'done'
			}
		]
	}
};

describe('parseImport, per fixture', () => {
	for (const [name, { format, rows, failures = 0 }] of Object.entries(tables)) {
		it(name, () => {
			const parsed = parseImport(fixture(name));
			expect(parsed.format).toBe(format);
			expect(parsed.failures).toHaveLength(failures);
			expect(
				parsed.items.map((i) => {
					const row: Row = {
						url: i.url,
						title: i.title,
						projects: i.projects,
						tags: i.tags,
						createdAt: i.createdAt
					};
					const want = rows.find((r) => r.url === i.url);
					if (want && 'notes' in want) row.notes = i.notes;
					if (want && 'status' in want) row.status = i.status;
					if (want && 'archived' in want) row.archived = i.archived;
					return row;
				})
			).toEqual(rows);
		});
	}

	it('gives each link the line it starts on, and a row with no address its line as a failure', () => {
		const parsed = parseImport(fixture('pocket.csv'));
		expect(parsed.items.map((i) => i.line)).toEqual([2, 3, 4, 6, 7, 9]);
		expect(parsed.failures).toEqual([{ line: 8, reason: 'A row with no address.' }]);
		const chrome = parseImport(fixture('chrome.html'));
		expect(chrome.items[0].line).toBe(11);
	});
});

describe('sniffFormat', () => {
	it.each([
		['<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL>', 'netscape'],
		['﻿  <!doctype netscape-bookmark-file-1>', 'netscape'],
		['<html><body><DL><DT><A HREF="https://a.b">x</A></DL>', 'netscape'],
		['title,url,time_added,tags,status\n', 'pocket-csv'],
		['"title","URL"\r\n', 'pocket-csv'],
		['<!doctype html><html><body><a href="https://a.b">a page</a>', null],
		['name,email\nme,me@example.com', null],
		['{"format":"linksink.export/1"}', null]
	])('%j is %s', (head, want) => {
		expect(sniffFormat(head)).toBe(want);
	});
});

describe('refused files', () => {
	const refused = (bytes: Uint8Array | string) => {
		try {
			parseImport(typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes);
		} catch (error) {
			expect(error).toBeInstanceOf(ImportRefused);
			return error as ImportRefused;
		}
		throw new Error('not refused');
	};

	it('a file over 20 MB, with 413', () => {
		const e = refused(new Uint8Array(20 * 1024 * 1024 + 1).fill(0x20));
		expect(e.status).toBe(413);
		expect(e.message).toMatch(/over 20 MB/);
	});
	it('an empty file', () => expect(refused('').message).toMatch(/empty/));
	it('a web page that is not a bookmarks file', () =>
		expect(refused('<!doctype html><p>Hello <a href="https://x.y">x</a>').message).toMatch(
			/not a bookmarks file/
		));
	it('binary', () =>
		expect(refused(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00])).message).toMatch(
			/not a bookmarks file/
		));
	it('a JSON file', () => expect(refused('{"links":[]}').message).toMatch(/not a bookmarks file/));
	it('a bookmarks file with no links', () =>
		expect(refused('<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n</DL><p>').message).toMatch(
			/no links/
		));
	it('a CSV whose quote never closes', () =>
		expect(refused('title,url\n"open,https://a.b\n').message).toMatch(/line 2 never closes/));
	it('a CSV with no address in any row', () =>
		expect(refused('title,url\nx,\n').message).toMatch(/line 2: A row with no address/));
});

describe('parseCsv', () => {
	it('reads quotes, doubled quotes, CRLF and line breaks inside a field', () => {
		expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\r\n,\n')).toEqual([
			{ fields: ['a', 'b'], line: 1 },
			{ fields: ['x, y', 'say "hi"\nthere'], line: 2 },
			{ fields: ['', ''], line: 4 }
		]);
	});
});

describe('fileTime', () => {
	it.each([
		['1700000000', 1700000000000],
		['1700000000000', 1700000000000],
		['1700000000000000', 1700000000000],
		['', null],
		['0', null],
		['-5', null],
		['12abc', null],
		['99999999999999999999', null]
	])('%j → %s', (value, want) => expect(fileTime(value)).toBe(want));
});
