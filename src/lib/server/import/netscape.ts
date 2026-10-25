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
import { Tokenizer } from 'htmlparser2';
import { append, ATTRIBUTE_MAX, cut, FIELD_MAX, IMPORT_LINKS_MAX, NAME_MAX } from './limits.ts';
import {
	fileTime,
	ImportRefused,
	type ImportFailure,
	type ImportFolder,
	type ImportItem
} from './types.ts';

const LINKDING_ARCHIVED = 'linkding:bookmarks.archived';
/** Folders deeper than this fold into the path of the folder at this depth. */
export const FOLDER_DEPTH_MAX = 32;
/** A folder's name is cut to the longest project name before it joins a path. */
const FOLDER_NAME_MAX = NAME_MAX;

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

const NOTES_OPEN = '[linkding-notes]';
const NOTES_CLOSE = '[/linkding-notes]';

/**
 * A `<DD>`'s text, cut to the notes limit first: linkding's notes markers taken out, the description and the notes
 * kept, a blank line apart. The markers are found with indexOf (a backtracking regex took quadratic time on a note
 * that repeats the opening marker).
 */
export function noteText(raw: string): string | null {
	const text = cut(raw, FIELD_MAX.notes).replace(/\r\n?/g, '\n').trim();
	if (!text) return null;
	const open = text.indexOf(NOTES_OPEN);
	const close = text.lastIndexOf(NOTES_CLOSE);
	if (
		open === -1 ||
		close < open + NOTES_OPEN.length ||
		text.slice(close + NOTES_CLOSE.length).trim()
	) {
		return text;
	}
	const description = text.slice(0, open).trim();
	const notes = text.slice(open + NOTES_OPEN.length, close).trim();
	return [description, notes].filter(Boolean).join('\n\n') || null;
}

/** A TAGS value's tags: the whole value cut to its limit before it is split. */
export function splitTags(value: string | undefined): string[] {
	if (!value) return [];
	return cut(value, FIELD_MAX.tags)
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
}

export function tooManyLinks() {
	return new ImportRefused(
		`That file holds more than ${IMPORT_LINKS_MAX.toLocaleString('en')} links; one import takes at most ${IMPORT_LINKS_MAX.toLocaleString('en')}. Split it, and import the parts one after another.`
	);
}

/**
 * Every link in a Netscape bookmark file, with its folder path; `<A>`s that are not links become failures.
 * `raindrop`: the file is Raindrop's export (its title, or a DATA-COVER attribute only Raindrop writes), whose own
 * top-level Unsorted collection the import preview starts on No project (T-0019).
 */
export function parseNetscape(text: string): {
	items: ImportItem[];
	failures: ImportFailure[];
	raindrop: boolean;
} {
	const lineAt = lineIndex(text);
	// Raindrop's header: <TITLE>Raindrop.io Bookmarks</TITLE> and the same <H1>, before the first list.
	let raindrop = /<(?:title|h1)>\s*Raindrop\.io\b/i.test(text.slice(0, 2048));
	const items: ImportItem[] = [];
	const failures: ImportFailure[] = [];

	// One entry per open <DL>: the folder path it lists (made once, when it opens), or null for no project (the top
	// list, or a browser container), and how many named folders deep it is.
	// `folder` is the same list for the import preview (T-0019): every named folder from the top, the browser's
	// containers included, made once per list and shared by its links; null at the top of the file.
	const folders: { path: string | null; depth: number; folder: ImportFolder | null }[] = [];
	let pendingNamed: { name: string; container: boolean } | null | undefined;
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
	// A <H3> or an <A> left open ends where the next list entry starts, as a browser reads it.
	const endHeading = () => {
		if (!heading) return;
		const folder = squash(heading.name).slice(0, FOLDER_NAME_MAX);
		pendingFolder = heading.container || !folder ? null : folder;
		pendingNamed = folder ? { name: folder, container: heading.container } : null;
		heading = null;
	};
	const endAnchor = () => {
		if (!anchor) return;
		const { href, attrs, line } = anchor;
		anchor = null;
		const url = cut(href, FIELD_MAX.url).trim();
		if (!url) {
			failures.push({ line, reason: 'A bookmark with no address.' });
			return;
		}
		const tags = splitTags(attrs.tags);
		const path = folders.at(-1)?.path ?? null;
		const folder = folders.at(-1)?.folder ?? null;
		const item: ImportItem = {
			url,
			title: squash(anchorText) || null,
			tags: tags.filter((t) => t !== LINKDING_ARCHIVED),
			projects: path ? [path] : [],
			createdAt: fileTime(cut(attrs.add_date, FIELD_MAX.date)),
			notes: null,
			status: null,
			archived: tags.includes(LINKDING_ARCHIVED),
			line
		};
		if (folder) item.folder = folder;
		items.push(item);
		if (items.length > IMPORT_LINKS_MAX) throw tooManyLinks();
		last = item;
	};

	function open(name: string, attrs: Record<string, string>, at: number) {
		if (
			name === 'dt' ||
			name === 'dl' ||
			name === 'dd' ||
			name === 'h3' ||
			name === 'a' ||
			name === 'hr'
		) {
			endNote();
			endAnchor();
			endHeading();
		}
		switch (name) {
			case 'dl': {
				const parent = folders.at(-1) ?? { path: null, depth: 0, folder: null };
				const folder = pendingFolder;
				const named = pendingNamed;
				pendingFolder = undefined;
				pendingNamed = undefined;
				// Past the depth cap a folder folds into its parent here too.
				const shown =
					named && (parent.folder?.path.length ?? 0) < FOLDER_DEPTH_MAX
						? {
								path: [...(parent.folder?.path ?? []), named.name],
								container: [...(parent.folder?.container ?? []), named.container]
							}
						: parent.folder;
				if (!folder || parent.depth >= FOLDER_DEPTH_MAX) folders.push({ ...parent, folder: shown });
				else {
					const path = parent.path ? `${parent.path} / ${folder}` : folder;
					folders.push({ path, depth: parent.depth + 1, folder: shown });
				}
				last = null;
				break;
			}
			case 'h3':
				heading = {
					name: '',
					container:
						attrs.personal_toolbar_folder === 'true' || attrs.unfiled_bookmarks_folder === 'true'
				};
				last = null;
				break;
			case 'a':
				if (Object.hasOwn(attrs, 'data-cover')) raindrop = true;
				anchor = { href: attrs.href, attrs, line: lineAt(at) };
				anchorText = '';
				break;
			case 'dd':
				dd = { item: last, text: '' };
				last = null;
				break;
		}
	}

	function close(name: string) {
		if (name === 'h3') endHeading();
		else if (name === 'a') endAnchor();
		else if (name === 'dl') {
			endNote();
			endAnchor();
			endHeading();
			folders.pop();
			last = null;
		} else if (name === 'dd') endNote();
	}

	function onText(chunk: string) {
		// Each is read only up to its limit, so a field of any length costs no more than that.
		if (anchor) anchorText = append(anchorText, chunk, FIELD_MAX.title);
		else if (heading) heading.name = append(heading.name, chunk, FIELD_MAX.folder);
		else if (dd) dd.text = append(dd.text, chunk, FIELD_MAX.notes);
	}

	// htmlparser2's Tokenizer reads tags, attributes and entities in one linear pass. Its Parser is not used: it keeps
	// open elements with Array#unshift, so a file nested thousands deep would take time growing with the square of
	// the depth. The only nesting kept here is `folders`, a stack of paths made once each.
	let tag = '';
	let tagAt = 0;
	let attrs: Record<string, string> = {};
	let attrName = '';
	let attrValue = '';
	const tokenizer = new Tokenizer(
		{ decodeEntities: true },
		{
			onopentagname(start, end) {
				tag = text.slice(start, end).toLowerCase();
				tagAt = start - 1;
				attrs = {};
			},
			onattribname(start, end) {
				attrName = text.slice(start, end).toLowerCase();
				attrValue = '';
			},
			onattribdata(start, end) {
				if (attrValue.length < ATTRIBUTE_MAX) {
					attrValue += text.slice(start, Math.min(end, start + ATTRIBUTE_MAX - attrValue.length));
				}
			},
			onattribentity(codepoint) {
				if (attrValue.length < ATTRIBUTE_MAX) attrValue += String.fromCodePoint(codepoint);
			},
			onattribend() {
				if (!Object.hasOwn(attrs, attrName)) attrs[attrName] = attrValue;
				attrValue = '';
			},
			onopentagend() {
				open(tag, attrs, tagAt);
			},
			onselfclosingtag() {
				open(tag, attrs, tagAt);
			},
			onclosetag(start, end) {
				close(text.slice(start, end).toLowerCase());
			},
			ontext(start, end) {
				onText(text.slice(start, end));
			},
			ontextentity(codepoint) {
				onText(String.fromCodePoint(codepoint));
			},
			oncdata() {},
			oncomment() {},
			ondeclaration() {},
			onprocessinginstruction() {},
			onend() {}
		}
	);
	tokenizer.write(text);
	tokenizer.end();
	endNote();
	endAnchor();
	return { items, failures, raindrop };
}
