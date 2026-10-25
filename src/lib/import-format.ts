// Which kind of file an import is, told from its first bytes. Shared by the server (which decides) and the Settings
// page (which shows the guess before the upload), so it imports nothing.

export type ImportFormat = 'netscape' | 'pocket-csv';

/** A file over this many bytes is refused before it is read (T-0012). */
export const IMPORT_MAX_BYTES = 20 * 1024 * 1024;

export const FORMAT_LABEL: Record<ImportFormat, string> = {
	netscape: 'Bookmarks file (HTML)',
	'pocket-csv': 'Pocket export (CSV)'
};

/** The columns of a CSV header line, lower-cased and unquoted. */
export function csvHeader(line: string): string[] {
	return line.split(',').map((c) =>
		c
			.trim()
			.replace(/^"(.*)"$/, '$1')
			.trim()
			.toLowerCase()
	);
}

/**
 * The format of a file from its start (the first 64 KB is plenty): a Netscape bookmark file (its DOCTYPE, or a
 * `<DT><A HREF` list as some tools write without one; the attributes before HREF are read for at most 2 KB, so
 * no backtracking grows with the text), or a CSV whose header has a `url` column (Pocket's export:
 * title,url,time_added,tags,status). Null for anything else.
 */
export function sniffFormat(head: string): ImportFormat | null {
	const text = head.replace(/^\uFEFF/, '').trimStart();
	if (/^<!DOCTYPE\s+NETSCAPE-Bookmark-file/i.test(text)) return 'netscape';
	if (text.startsWith('<') && /<dt>\s*<a\s[^>]{0,2048}href\s*=/i.test(text)) return 'netscape';
	if (text.startsWith('<')) return null;
	const first = text.split(/\r?\n/, 1)[0];
	return csvHeader(first).includes('url') ? 'pocket-csv' : null;
}
