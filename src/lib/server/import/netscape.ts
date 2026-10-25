// Reads a Netscape bookmark file, the format every browser and bookmarking tool exports: nested `<DL>` lists of
// `<DT><H3>` folders and `<DT><A HREF>` links, each link optionally followed by a `<DD>` note. Shapes this follows,
// from each writer's own source or a real export (researcher report M-2026-10-25-fffd0b0a):
// - Chromium (bookmark_html_writer.cc): HREF, ADD_DATE (seconds), ICON; the bar is `PERSONAL_TOOLBAR_FOLDER="true"`.
// - Firefox (BookmarkHTMLUtils.sys.mjs): also LAST_MODIFIED, TAGS, SHORTCUTURL; `UNFILED_BOOKMARKS_FOLDER="true"`.
// - Raindrop: collections as nested `<H3>` folders; TAGS, DATA-COVER, LAST_MODIFIED.
// - Pinboard: PRIVATE, TOREAD, TAGS (comma-separated); `<DD>` with no closing tag.
// - linkding (exporter.py): TAGS comma-joined, the tag `linkding:bookmarks.archived` for an archived bookmark, and a
//   `<DD>` of the description with the notes inside `[linkding-notes]...[/linkding-notes]`.
// A browser's own top-level containers (the bookmarks bar, Firefox's Other Bookmarks) are where everything lives,
// not folders the person made, so they do not become projects; the folders inside them do.
import { Parser } from 'htmlparser2';
import { fileTime, type ImportFailure, type ImportItem } from './types.ts';

const LINKDING_ARCHIVED = 'linkding:bookmarks.archived';

/** Line numbers (1-based) for offsets into `text`. */
function lineIndex(text: string) {
	const starts = [0];
	for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
	return (offset: number) => {
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (starts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo + 1;
	};
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** A `<DD>`'s text: linkding's notes markers taken out, the description and the notes kept, a blank line apart. */
function noteText(raw: string): string | null {
	const text = raw.replace(/\r\n?/g, '\n').trim();
	if (!text) return null;
	const m = /^([\s\S]*?)\[linkding-notes\]([\s\S]*?)\[\/linkding-notes\]\s*$/.exec(text);
	if (!m) return text;
	return [m[1].trim(), m[2].trim()].filter(Boolean).join('\n\n') || null;
}

export function splitTags(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
}

/** Every link in a Netscape bookmark file, with its folder path; `<A>`s that are not links become failures. */
export function parseNetscape(text: string): { items: ImportItem[]; failures: ImportFailure[] } {
	const lineAt = lineIndex(text);
	const items: ImportItem[] = [];
	const failures: ImportFailure[] = [];

	// One entry per open <DL>: the folder name it lists, or null (the top list, or a browser container).
	const folders: (string | null)[] = [];
	// The same lists, keeping the browser's containers by name for the import preview (T-0019); null for the top
	// list or a folder with no name.
	const trail: ({ name: string; container: boolean } | null)[] = [];
	let pendingTrail: { name: string; container: boolean } | null | undefined;
	let heading: { name: string; container: boolean } | null = null;
	let pendingFolder: string | null | undefined; // a closed <H3> waiting for its <DL>
	let anchor: { href: string | undefined; attrs: Record<string, string>; line: number } | null =
		null;
	let anchorText = '';
	let dd: { item: ImportItem | null; text: string } | null = null;
	let last: ImportItem | null = null; // the link a <DD> right after it belongs to

	const endNote = () => {
		if (dd?.item) dd.item.notes = noteText(dd.text);
		dd = null;
	};

	const parser = new Parser(
		{
			onopentag(name, attrs) {
				if (name === 'dt' || name === 'dl' || name === 'h3' || name === 'a' || name === 'hr') {
					endNote();
				}
				switch (name) {
					case 'dl':
						folders.push(pendingFolder ?? null);
						pendingFolder = undefined;
						trail.push(pendingTrail ?? null);
						pendingTrail = undefined;
						last = null;
						break;
					case 'h3':
						heading = {
							name: '',
							container:
								attrs.personal_toolbar_folder === 'true' ||
								attrs.unfiled_bookmarks_folder === 'true'
						};
						last = null;
						break;
					case 'a':
						anchor = { href: attrs.href, attrs, line: lineAt(parser.startIndex) };
						anchorText = '';
						break;
					case 'dd':
						dd = { item: last, text: '' };
						last = null;
						break;
				}
			},
			ontext(chunk) {
				if (anchor) anchorText += chunk;
				else if (heading) heading.name += chunk;
				else if (dd) dd.text += chunk;
			},
			onclosetag(name) {
				if (name === 'h3' && heading) {
					const folder = squash(heading.name);
					pendingFolder = heading.container || !folder ? null : folder;
					pendingTrail = folder ? { name: folder, container: heading.container } : null;
					heading = null;
				} else if (name === 'a' && anchor) {
					const { href, attrs, line } = anchor;
					anchor = null;
					const url = href?.trim();
					if (!url) {
						failures.push({ line, reason: 'A bookmark with no address.' });
						return;
					}
					const tags = splitTags(attrs.tags);
					const path = folders.filter((f): f is string => f !== null).join(' / ');
					const named = trail.filter((f) => f !== null);
					const item: ImportItem = {
						url,
						title: squash(anchorText) || null,
						tags: tags.filter((t) => t !== LINKDING_ARCHIVED),
						projects: path ? [path] : [],
						createdAt: fileTime(attrs.add_date),
						notes: null,
						status: null,
						archived: tags.includes(LINKDING_ARCHIVED),
						line
					};
					if (named.length) {
						item.folder = {
							path: named.map((f) => f.name),
							container: named.map((f) => f.container)
						};
					}
					items.push(item);
					last = item;
				} else if (name === 'dl') {
					endNote();
					folders.pop();
					trail.pop();
					last = null;
				} else if (name === 'dd') {
					endNote();
				}
			}
		},
		{ decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true }
	);
	parser.write(text);
	parser.end();
	endNote();
	return { items, failures };
}
