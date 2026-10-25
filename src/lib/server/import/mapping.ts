// The import preview and its folder mapping (T-0019, plan P-T-0019): what a file holds, read without writing, and
// what each of its folders becomes (a new project, an existing one, a tag, or nothing), checked on the server before
// anything is saved.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { ImportFormat } from '../../import-format.ts';
import type { DB } from '../db/open.ts';
import { cleanUrl, normalise } from '../../url.ts';
import { links, projects } from '../db/schema.ts';
import { BadPatchError } from '../links.ts';
import { cut, NAME_MAX, NAME_RAW_MAX } from './limits.ts';
import { displayName, tagName } from '../organise.ts';
import { ImportRefused, type ImportFailure, type ImportItem, type ParsedFile } from './types.ts';
import { IMPORT_BATCH, uniqueItems } from './write.ts';

/** What one folder becomes. */
export type FolderChoice =
	| { kind: 'new'; name: string }
	| { kind: 'existing'; projectId: string }
	| { kind: 'tag'; name: string }
	| { kind: 'none' };

/** The options sent with an import: a choice per folder (by key), and the two switches. */
export interface ImportOptions {
	mapping: Record<string, FolderChoice>;
	keepTags: boolean;
	pocketReadDone: boolean;
}

export interface PreviewFolder {
	/** The folder's key in a mapping: its path as JSON. */
	key: string;
	/** Every folder from the top, the browser's own containers included. */
	path: string[];
	/** The links directly in it. */
	count: number;
	/** The browser's own top folder (bookmarks bar, Other Bookmarks, Bookmarks Menu, Mobile), or one inside only those. */
	container: boolean;
	/** The choice the screen starts on, and the one used when an import sends none for this folder. */
	suggested: FolderChoice;
}

export interface Preview {
	format: ImportFormat;
	/** Links read from the file with a web address, copies included. */
	links: number;
	/** Of those, already saved or a second time in the file. */
	duplicates: number;
	/** What an import would add: links minus duplicates. */
	adding: number;
	/** Lines that gave no web link. */
	unreadable: number;
	failures: ImportFailure[];
	/** Links in no folder: they arrive with no project, in Unsorted. */
	loose: number;
	folders: PreviewFolder[];
	/** Tags the file gives, each once (lower-cased as stored). */
	tags: string[];
	/** The file is Pocket's: its read state can become Done. */
	pocketRead: boolean;
}

/** Top-level folder names a browser makes itself (Chrome writes Other and Mobile bookmarks with no attribute). */
const CONTAINER_NAMES = new Set([
	'bookmarks bar',
	'bookmarks toolbar',
	'favorites bar',
	'favourites bar',
	'other bookmarks',
	'bookmarks menu',
	'mobile bookmarks',
	'mobile'
]);

export const folderKey = (path: string[]) => JSON.stringify(path);

/** A link with a web address, as the writer takes it. */
const readable = (item: ImportItem) => normalise(item.url) !== null && cleanUrl(item.url) !== null;

/**
 * Which segments of a path are the browser's own containers: one that says so, or a known name at the very top; in
 * a Raindrop file, also its own top-level Unsorted collection (done_when 2: Raindrop's only, the orchestrator's
 * default of 2026-10-25 until the person looks). A folder named Unsorted in any other file is the person's.
 */
function containers(folder: NonNullable<ImportItem['folder']>, raindrop: boolean): boolean[] {
	return folder.path.map((name, i) => {
		if (folder.container[i]) return true;
		if (i !== 0) return false;
		const lower = name.toLowerCase();
		return CONTAINER_NAMES.has(lower) || (raindrop && lower === 'unsorted');
	});
}

/** A name cut to what the app stores: NFKC, trimmed, inner spaces collapsed, at most 64 characters. */
// The raw text is cut before NFKC, as the writer does (T-0012 round 4): NFKC can make one character 18.
const fitName = (s: string) =>
	cut(s, NAME_RAW_MAX).normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX).trim();

/**
 * The choice a folder starts on: none for the browser's own top folders; the existing project whose name matches
 * the folder's (any case); else a new project named after it, nested names joined with " / ", containers left out.
 */
export function defaultChoice(
	path: string[],
	isContainer: boolean[],
	projectsByName: Map<string, string>
): FolderChoice {
	const name = fitName(path.filter((_, i) => !isContainer[i]).join(' / '));
	if (!name) return { kind: 'none' };
	const projectId = projectsByName.get(name.toLowerCase());
	return projectId ? { kind: 'existing', projectId } : { kind: 'new', name };
}

/** The user's live projects, by lower-cased name and by id. */
function liveProjects(db: DB, userId: string) {
	const rows = db
		.select({ id: projects.id, name: projects.name })
		.from(projects)
		.where(and(eq(projects.userId, userId), isNull(projects.deletedAt)))
		.all();
	return {
		byName: new Map(rows.map((p) => [p.name.toLowerCase(), p.id])),
		ids: new Set(rows.map((p) => p.id))
	};
}

/** Every folder that holds a web link, in file order, with its count (copies included) and default choice. */
export function foldersOf(
	items: ImportItem[],
	projectsByName: Map<string, string>,
	raindrop = false
): PreviewFolder[] {
	const byKey = new Map<string, PreviewFolder>();
	for (const item of items) {
		if (!item.folder || !readable(item)) continue;
		const key = folderKey(item.folder.path);
		const known = byKey.get(key);
		if (known) {
			known.count++;
			continue;
		}
		const isContainer = containers(item.folder, raindrop);
		byKey.set(key, {
			key,
			path: [...item.folder.path],
			count: 1,
			container: isContainer.every(Boolean),
			suggested: defaultChoice(item.folder.path, isContainer, projectsByName)
		});
	}
	return [...byKey.values()];
}

/**
 * What a file holds, read and checked against what the user has saved, with nothing written: its links, their
 * duplicates, the lines that could not be read, and every folder with its count and default choice.
 */
export function previewImport(db: DB, userId: string, parsed: ParsedFile): Preview {
	const { unique, failures: bad, duplicates: repeated } = uniqueItems(parsed.items);
	let saved = 0;
	for (let i = 0; i < unique.length; i += IMPORT_BATCH) {
		const keys = unique.slice(i, i + IMPORT_BATCH).map((u) => u.key);
		saved += db
			.select({ key: links.urlKey })
			.from(links)
			.where(and(eq(links.userId, userId), isNull(links.deletedAt), inArray(links.urlKey, keys)))
			.all().length;
	}
	const failures = [...parsed.failures, ...bad].sort((a, b) => a.line - b.line);
	const read = parsed.items.length - bad.length;
	const tags = new Set<string>();
	for (const item of parsed.items) {
		for (const t of item.tags) {
			try {
				tags.add(tagName(fitName(t)));
			} catch {
				// A tag that is only spaces is dropped on import too.
			}
		}
	}
	return {
		format: parsed.format,
		links: read,
		duplicates: repeated + saved,
		adding: unique.length - saved,
		unreadable: failures.length,
		failures,
		loose: parsed.items.filter((i) => !i.folder && readable(i)).length,
		folders: foldersOf(parsed.items, liveProjects(db, userId).byName, parsed.raindrop),
		tags: [...tags].sort(),
		pocketRead: parsed.format === 'pocket-csv'
	};
}

const refuse = (message: string) => new ImportRefused(message, 400);
const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** A name as the app checks it, or a refusal naming the folder. */
function checkedName(value: unknown, check: (s: unknown) => string, folder: string[]): string {
	// A name sent far longer than any the app keeps is refused before it is normalised (NFKC can grow it 18 times).
	if (typeof value === 'string' && value.length > NAME_RAW_MAX) {
		throw refuse(`A name is at most ${NAME_MAX} characters (the folder ${folder.join(' › ')})`);
	}
	try {
		return check(value);
	} catch (error) {
		if (error instanceof BadPatchError) {
			throw refuse(`${error.message} (the folder ${folder.join(' › ')})`);
		}
		throw error;
	}
}

/**
 * The options sent with an import, checked against the file and the user: every key is one of the file's folders,
 * every choice is one of the four, names are within the app's rules, and an existing project is the user's own and
 * live. Anything else is refused as a whole (ImportRefused, 400), before anything is written. A folder the mapping
 * leaves out gets its default.
 */
export function checkOptions(
	db: DB,
	userId: string,
	parsed: ParsedFile,
	raw: unknown
): { choices: Map<string, FolderChoice>; keepTags: boolean; pocketReadDone: boolean } {
	if (!isRecord(raw)) throw refuse('The import options are not readable.');
	const { mapping = {}, keepTags = true, pocketReadDone = true } = raw;
	if (typeof keepTags !== 'boolean' || typeof pocketReadDone !== 'boolean') {
		throw refuse('keepTags and pocketReadDone are true or false.');
	}
	if (!isRecord(mapping)) throw refuse('The folder mapping is not readable.');
	const live = liveProjects(db, userId);
	const folders = new Map(
		foldersOf(parsed.items, live.byName, parsed.raindrop).map((f) => [f.key, f])
	);
	const choices = new Map<string, FolderChoice>();
	for (const [key, choice] of Object.entries(mapping)) {
		const folder = folders.get(key);
		if (!folder) throw refuse('The mapping names a folder that is not in this file.');
		if (!isRecord(choice)) throw refuse('A folder’s choice is not readable.');
		switch (choice.kind) {
			case 'new':
				choices.set(key, {
					kind: 'new',
					name: checkedName(choice.name, (s) => displayName(s, 'project'), folder.path)
				});
				break;
			case 'tag':
				choices.set(key, { kind: 'tag', name: checkedName(choice.name, tagName, folder.path) });
				break;
			case 'existing':
				if (typeof choice.projectId !== 'string' || !live.ids.has(choice.projectId)) {
					throw refuse(
						`That project is not one of yours, or no longer exists (the folder ${folder.path.join(' › ')}).`
					);
				}
				choices.set(key, { kind: 'existing', projectId: choice.projectId });
				break;
			case 'none':
				choices.set(key, { kind: 'none' });
				break;
			default:
				throw refuse('A folder becomes a new project, an existing project, a tag, or nothing.');
		}
	}
	for (const [key, folder] of folders) if (!choices.has(key)) choices.set(key, folder.suggested);
	return { choices, keepTags, pocketReadDone };
}

/**
 * The items as the mapping says: each link's projects and tags from its folder's choice (a link in no folder, or a
 * folder mapped to nothing, joins no project), the file's tags kept or dropped, and Pocket's read state kept as Done
 * or dropped.
 */
export function applyMapping(
	items: ImportItem[],
	{
		choices,
		keepTags,
		pocketReadDone
	}: { choices: Map<string, FolderChoice>; keepTags: boolean; pocketReadDone: boolean },
	format: ImportFormat
): ImportItem[] {
	return items.map((item) => {
		const choice = item.folder ? choices.get(folderKey(item.folder.path)) : undefined;
		const tags = keepTags ? [...item.tags] : [];
		const out: ImportItem = {
			...item,
			tags,
			projects: [],
			projectIds: [],
			status: format === 'pocket-csv' && !pocketReadDone ? null : item.status
		};
		if (choice?.kind === 'new') out.projects = [choice.name];
		else if (choice?.kind === 'existing') out.projectIds = [choice.projectId];
		else if (choice?.kind === 'tag') out.tags = [...tags, choice.name];
		return out;
	});
}
