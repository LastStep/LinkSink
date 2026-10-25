// T-0012 fix round 4 (M-2026-10-25-de517a71): every raw field of an import file is cut to its limit before any regex,
// normalisation or splitting, and one import holds at most 100,000 links. The limits are written out here (not
// imported) so the same file runs against older code.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSyncWrite, type SyncWrite } from '../sync/write.ts';
import { addUser, tempDatabase } from '../test/db.ts';
import { snapshot } from '../test/synced.ts';
import { createImportApi } from './api.ts';
import { importItems, parseImport } from './index.ts';

let t: ReturnType<typeof tempDatabase>;
let syncWrite: SyncWrite;
let me: { id: string };
beforeEach(() => {
	t = tempDatabase();
	syncWrite = createSyncWrite(t.db);
	me = { id: addUser(t.db, 'me') };
});
afterEach(() => t.close());

const MB = 1024 * 1024;
const bytes = (s: string) => new TextEncoder().encode(s);
const html = (entry: string) =>
	`<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n${entry}\n</DL><p>\n`;
const csv = (row: string) => `title,url,time_added,tags,status\n${row}\n`;

/** Parses and writes a file, timed. */
async function run(file: string) {
	const started = performance.now();
	const parsed = parseImport(bytes(file));
	const result = await (importItems as unknown as (...a: unknown[]) => Promise<unknown>)(
		t.db,
		syncWrite,
		me.id,
		parsed.items
	);
	return { parsed, result, ms: performance.now() - started };
}

describe('E1: the linkding notes markers', () => {
	it('a 1 MB note repeating the opening marker with no close parses in under 100 ms', () => {
		const note = '[linkding-notes]a'.repeat(Math.ceil(MB / 17));
		const file = html(`<DT><A HREF="https://e1.example.com/">E1</A>\n<DD>${note}`);
		const started = performance.now();
		const parsed = parseImport(bytes(file));
		const ms = performance.now() - started;
		expect(ms).toBeLessThan(100);
		expect(parsed.items[0].notes!.length).toBeLessThanOrEqual(20_000);
	});
});

describe('E2: names are cut before NFKC', () => {
	it('a TAGS value of U+FDFA is cut before it is normalised (no normalize() on more than 256 characters)', async () => {
		const longest: number[] = [];
		const normalize = String.prototype.normalize;
		String.prototype.normalize = function (this: string, form?: string) {
			longest.push(this.length);
			return normalize.call(this, form);
		};
		try {
			// 300,000 characters, each 18 after NFKC: 5.4 million before the cut, at most 256 × 18 after it.
			const tags = 'ﷺ'.repeat(300_000);
			const file = html(`<DT><A HREF="https://e2.example.com/" TAGS="${tags}">E2</A>`);
			await run(file);
		} finally {
			String.prototype.normalize = normalize;
		}
		let most = 0;
		for (const n of longest) if (n > most) most = n;
		expect(most).toBeLessThanOrEqual(256);
	});
});

// One row per raw field: 1 MB of hostile content in it. Each file parses and imports in linear time (well under a
// quarter second), and what the parser hands on is already cut to the field's limit.
const hostile = 'x '.repeat(MB / 2);
const rows: [string, string, (p: ReturnType<typeof parseImport>) => number, number][] = [
	[
		'HTML address',
		html(`<DT><A HREF="https://h.example.com/${'a'.repeat(MB)}">A</A>`),
		(p) => p.items[0]?.url.length ?? 0,
		8_192
	],
	[
		'HTML title',
		html(`<DT><A HREF="https://h.example.com/t">${hostile}</A>`),
		(p) => p.items[0].title!.length,
		2_000
	],
	[
		'HTML notes',
		html(`<DT><A HREF="https://h.example.com/n">N</A>\n<DD>${hostile}`),
		(p) => p.items[0].notes!.length,
		20_000
	],
	[
		'HTML tags (commas)',
		html(`<DT><A HREF="https://h.example.com/g" TAGS="${',a'.repeat(MB / 2)}">G</A>`),
		(p) => p.items[0].tags.join(',').length,
		25_700
	],
	[
		'HTML folder name',
		html(`<DT><H3>${hostile}</H3>\n<DL><p>\n<DT><A HREF="https://h.example.com/f">F</A>\n</DL><p>`),
		(p) => p.items[0].projects[0].length,
		256
	],
	[
		'HTML date',
		html(`<DT><A HREF="https://h.example.com/d" ADD_DATE="${'1'.repeat(MB)}">D</A>`),
		(p) => (p.items[0].createdAt === null ? 0 : 1),
		0
	],
	[
		'CSV address',
		csv(`T,https://c.example.com/${'a'.repeat(MB)},1,,unread`),
		(p) => p.items[0]?.url.length ?? 0,
		8_192
	],
	[
		'CSV title',
		csv(`"${hostile}",https://c.example.com/t,1,,unread`),
		(p) => p.items[0].title!.length,
		2_000
	],
	[
		'CSV tags',
		csv(`T,https://c.example.com/g,1,${'|a'.repeat(MB / 2)},unread`),
		(p) => p.items[0].tags.join('|').length,
		25_700
	],
	[
		'CSV date',
		csv(`T,https://c.example.com/d,${' 1'.repeat(MB / 2)},,unread`),
		(p) => (p.items[0].createdAt === null ? 0 : 1),
		0
	],
	[
		'CSV status',
		csv(`T,https://c.example.com/s,1,,${'archive '.repeat(MB / 8)}`),
		(p) => (p.items[0].status === null ? 0 : 1),
		0
	]
];

describe('every raw field is cut first', () => {
	it.each(rows)(
		'%s: 1 MB parses and imports in under 250 ms, cut to its limit',
		async (_, file, size, max) => {
			const { parsed, ms } = await run(file);
			expect(ms).toBeLessThan(250);
			expect(size(parsed)).toBeLessThanOrEqual(max);
		}
	);
});

describe('at most 100,000 links in one import', () => {
	const many = (n: number) =>
		html(
			Array.from({ length: n }, (_, i) => `<DT><A HREF="https://m.example.com/${i}">M</A>`).join(
				'\n'
			)
		);

	it('100,001 links are refused before anything is written, with a message that says so', async () => {
		const api = createImportApi({ db: t.db, syncWrite });
		const before = snapshot(t.db);
		const res = await api.import(
			me,
			new Request('http://localhost/api/import', {
				method: 'POST',
				headers: { 'content-type': 'application/octet-stream' },
				body: many(100_001)
			})
		);
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe(
			'That file holds more than 100,000 links; one import takes at most 100,000. Split it, and import the parts one after another.'
		);
		expect(snapshot(t.db)).toEqual(before);
	}, 30_000);

	it('the same for a Pocket CSV', () => {
		const file =
			'title,url\n' +
			Array.from({ length: 100_001 }, (_, i) => `M,https://m.example.com/${i}`).join('\n');
		expect(() => parseImport(bytes(file))).toThrow(/more than 100,000 links/);
	});

	it('100,000 links are read', () => {
		expect(parseImport(bytes(many(100_000))).items).toHaveLength(100_000);
	}, 30_000);
});
