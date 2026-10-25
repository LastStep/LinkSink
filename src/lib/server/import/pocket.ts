// Reads Pocket's CSV export (2024 until Pocket closed in 2025): the header `title,url,time_added,tags,status`, tags
// separated by `|`, `time_added` in seconds, status `unread` or `archive` (researcher report M-2026-10-25-fffd0b0a,
// from Karakeep's parser and tests). Some exports add a `cursor` column, so columns are read by their header name.
// Quoting is standard CSV (RFC 4180): a quoted field may hold commas, doubled quotes and line breaks.
import { fileTime, ImportRefused, type ImportFailure, type ImportItem } from './types.ts';

/** The records of a CSV file, each with the line it starts on. Throws ImportRefused on an unclosed quote. */
export function parseCsv(text: string): { fields: string[]; line: number }[] {
	const rows: { fields: string[]; line: number }[] = [];
	let fields: string[] = [];
	let field = '';
	let quoted = false;
	let line = 1;
	let rowLine = 1;
	let quoteLine = 1;
	let any = false; // the current record has started
	const s = text.replace(/^\uFEFF/, '');
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (quoted) {
			if (c === '"') {
				if (s[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else {
				if (c === '\n') line++;
				field += c;
			}
			continue;
		}
		if (c === '"' && field === '') {
			quoted = true;
			quoteLine = line;
			any = true;
		} else if (c === ',') {
			fields.push(field);
			field = '';
			any = true;
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && s[i + 1] === '\n') i++;
			if (any || field) {
				fields.push(field);
				rows.push({ fields, line: rowLine });
			}
			fields = [];
			field = '';
			any = false;
			line++;
			rowLine = line;
		} else {
			field += c;
			any = true;
		}
	}
	if (quoted)
		throw new ImportRefused(
			`The CSV file is cut short: a quote opened on line ${quoteLine} never closes.`
		);
	if (any || field) {
		fields.push(field);
		rows.push({ fields, line: rowLine });
	}
	return rows;
}

export function parsePocketCsv(text: string): { items: ImportItem[]; failures: ImportFailure[] } {
	const rows = parseCsv(text);
	const header = rows.shift();
	const columns = header ? header.fields.map((f) => f.trim().toLowerCase()) : [];
	const col = (name: string) => columns.indexOf(name);
	const url = col('url');
	if (url === -1) throw new ImportRefused('That CSV file has no url column.');
	const [title, added, tags, status] = ['title', 'time_added', 'tags', 'status'].map(col);
	const items: ImportItem[] = [];
	const failures: ImportFailure[] = [];
	for (const { fields, line } of rows) {
		const get = (i: number) => (i === -1 ? '' : (fields[i] ?? '').trim());
		const address = get(url);
		if (!address) {
			failures.push({ line, reason: 'A row with no address.' });
			continue;
		}
		const state = get(status).toLowerCase();
		items.push({
			url: address,
			title: get(title).replace(/\s+/g, ' ') || null,
			tags: get(tags)
				.split('|')
				.map((t) => t.trim())
				.filter(Boolean),
			projects: [],
			createdAt: fileTime(get(added)),
			notes: null,
			status: state === 'archive' || state === 'read' ? 'done' : null,
			archived: false,
			line
		});
	}
	return { items, failures };
}
