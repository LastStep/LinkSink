// Writes an import's links (T-0012): each address once (by url_key, against the user's saved links and within the
// file), in batches of 500 links per syncWrite (ADR-0001), each batch making the tags and projects it needs.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { COLORS } from '../../fields.ts';
import { cleanUrl, displayHost, normalise } from '../../url.ts';
import { linkProjects, links, linkTags, projects, tags } from '../db/schema.ts';
import { displayName, tagName } from '../organise.ts';
import type { SyncWrite, SyncWriter } from '../sync/write.ts';
import { ulid } from '../ulid.ts';
import { ImportStopped, type ImportFailure, type ImportItem } from './types.ts';

export const IMPORT_BATCH = 500;
const NAME_MAX = 64;
const TITLE_MAX = 500;
const NOTES_MAX = 20_000;
/** The most tags one imported link takes; the rest are dropped. */
export const TAGS_MAX = 100;

export interface ImportResult {
	added: number;
	/** Skipped: already saved, or a second time in the file (its tags and projects join the first). */
	duplicates: number;
	failures: ImportFailure[];
	/** The new links' ids, in file order. */
	addedIds: string[];
}

/** An item checked and normalised before anything is written: one per address. */
export interface Unique extends ImportItem {
	key: string;
	clean: string;
	/** Tag names as stored (at most TAGS_MAX), sorted. */
	tagNames: string[];
	/** Project names, one per name in any case (the first spelling kept). */
	projectNames: string[];
}

/** A name cut to the longest the app stores, then checked as the app checks it; null if nothing is left. */
function named(input: string, check: (s: string) => string): string | null {
	try {
		return check(input.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX));
	} catch {
		return null;
	}
}

/** The live tag ids by name and project ids by lower-cased name, made when missing, inside one write. */
function namer(w: SyncWriter) {
	const tagIds = new Map(
		w.tx
			.select({ id: tags.id, name: tags.name })
			.from(tags)
			.where(and(eq(tags.userId, w.userId), isNull(tags.deletedAt)))
			.all()
			.map((t) => [t.name, t.id])
	);
	const live = w.tx
		.select({ id: projects.id, name: projects.name, position: projects.position })
		.from(projects)
		.where(and(eq(projects.userId, w.userId), isNull(projects.deletedAt)))
		.all();
	const projectIds = new Map(live.map((p) => [p.name.toLowerCase(), p.id]));
	let count = live.length;
	let position = Math.max(0, ...live.map((p) => p.position + 1));
	return {
		tag(name: string) {
			let id = tagIds.get(name);
			if (!id) {
				id = ulid(w.now);
				w.insert(tags, { id, name, color: null });
				tagIds.set(name, id);
			}
			return id;
		},
		project(name: string) {
			let id = projectIds.get(name.toLowerCase());
			if (!id) {
				id = ulid(w.now);
				// The next colour in turn, as createProject picks it.
				w.insert(projects, {
					id,
					name,
					color: COLORS[count % (COLORS.length - 1)],
					description: null,
					position: position++
				});
				count++;
				projectIds.set(name.toLowerCase(), id);
			}
			return id;
		}
	};
}

function writeBatch(syncWrite: SyncWrite, userId: string, batch: Unique[]) {
	return syncWrite(userId, (w) => {
		const saved = new Set(
			w.tx
				.select({ key: links.urlKey })
				.from(links)
				.where(
					and(
						eq(links.userId, userId),
						isNull(links.deletedAt),
						inArray(
							links.urlKey,
							batch.map((b) => b.key)
						)
					)
				)
				.all()
				.map((r) => r.key)
		);
		const names = namer(w);
		// Existing projects named by id (T-0019's mapping): checked as the caller's before the import began, and again
		// here, inside the write, so one deleted since is left out rather than linked.
		const wanted = [...new Set(batch.flatMap((b) => b.projectIds ?? []))];
		const existing = new Map(
			wanted.length
				? w.tx
						.select({ id: projects.id, name: projects.name })
						.from(projects)
						.where(
							and(
								eq(projects.userId, userId),
								isNull(projects.deletedAt),
								inArray(projects.id, wanted)
							)
						)
						.all()
						.map((p) => [p.id, p.name])
				: []
		);
		const ids: string[] = [];
		for (const item of batch) {
			if (saved.has(item.key)) continue;
			const { tagNames } = item;
			// Each project once, whether named by the file or by id: id to name, in the order first met.
			const joined = new Map<string, string>();
			for (const name of item.projectNames) {
				const projectId = names.project(name);
				if (!joined.has(projectId)) joined.set(projectId, name);
			}
			for (const projectId of item.projectIds ?? []) {
				const name = existing.get(projectId);
				if (name !== undefined && !joined.has(projectId)) joined.set(projectId, name);
			}
			const projectNames = [...joined.values()];
			const id = ulid(w.now);
			const { title } = item;
			const createdAt = item.createdAt ?? w.now;
			w.insert(links, {
				id,
				url: item.clean,
				urlKey: item.key,
				title: title ?? displayHost(item.clean),
				notes: item.notes,
				status: item.status,
				archivedAt: item.archived ? w.now : null,
				userSet: JSON.stringify(title ? ['title'] : []),
				metaState: 'pending',
				savedVia: 'import',
				createdAt,
				tagsText: tagNames.join(' '),
				projectsText: projectNames.join(' ')
			});
			for (const name of tagNames) w.insert(linkTags, { linkId: id, tagId: names.tag(name) });
			for (const projectId of joined.keys()) w.insert(linkProjects, { linkId: id, projectId });
			ids.push(id);
		}
		return ids;
	});
}

/**
 * Saves the items as the user's links, `saved_via = 'import'`. An address already saved is skipped; one that comes
 * again in the file is skipped too, its tags, projects and notes joining the first. `onCreated` hears of each new
 * link once its batch is written (the app queues its page details fetch).
 */
export function importItems(
	syncWrite: SyncWrite,
	userId: string,
	items: ImportItem[],
	onCreated: (linkId: string) => void = () => {}
): ImportResult {
	const { unique, failures, duplicates: repeated } = uniqueItems(items);
	let duplicates = repeated;
	const addedIds: string[] = [];
	for (let i = 0; i < unique.length; i += IMPORT_BATCH) {
		const batch = unique.slice(i, i + IMPORT_BATCH);
		let ids: string[];
		try {
			ids = writeBatch(syncWrite, userId, batch);
		} catch (error) {
			// The batch rolled back; the batches before it stay written.
			throw new ImportStopped(addedIds.length, error);
		}
		duplicates += batch.length - ids.length;
		addedIds.push(...ids);
		for (const id of ids) onCreated(id);
	}
	return { added: addedIds.length, duplicates, failures, addedIds };
}

/**
 * The items each address once (by url_key), in file order, checked and normalised: a second copy is counted as a
 * duplicate and its tags, projects and notes join the first; an item with no web address is a failure. Nothing is
 * read or written (the preview counts with it too).
 */
export function uniqueItems(items: ImportItem[]): {
	unique: Unique[];
	failures: ImportFailure[];
	duplicates: number;
} {
	const failures: ImportFailure[] = [];
	const byKey = new Map<string, Unique>();
	let duplicates = 0;
	for (const item of items) {
		const key = normalise(item.url);
		const clean = key ? cleanUrl(item.url) : null;
		if (!key || !clean) {
			failures.push({
				line: item.line,
				reason: URL.canParse(item.url)
					? `Not a web address (${item.url.slice(0, 40)}).`
					: 'Not a link.'
			});
			continue;
		}
		const first = byKey.get(key);
		if (first) {
			duplicates++;
			first.tags.push(...item.tags);
			first.projects.push(...item.projects);
			if (item.projectIds?.length) {
				first.projectIds = [...(first.projectIds ?? []), ...item.projectIds];
			}
			first.notes ??= item.notes;
			continue;
		}
		byKey.set(key, {
			...item,
			tags: [...item.tags],
			projects: [...item.projects],
			projectIds: item.projectIds ? [...item.projectIds] : undefined,
			key,
			clean,
			tagNames: [],
			projectNames: []
		});
	}
	// Everything is checked and normalised here, before the first write.
	const unique = [...byKey.values()];
	for (const u of unique) {
		const tagSet = new Set<string>();
		for (const t of u.tags) {
			const name = named(t, tagName);
			if (name !== null) tagSet.add(name);
			if (tagSet.size === TAGS_MAX) break;
		}
		u.tagNames = [...tagSet].sort();
		const projectSet = new Map<string, string>();
		for (const p of u.projects) {
			const name = named(p, (x) => displayName(x, 'project'));
			// Project names are unique in any case (organise.ts), so "Reading" and "reading" are one project.
			if (name !== null && !projectSet.has(name.toLowerCase()))
				projectSet.set(name.toLowerCase(), name);
		}
		u.projectNames = [...projectSet.values()];
		u.title = u.title?.trim().slice(0, TITLE_MAX) || null;
		u.notes = u.notes?.slice(0, NOTES_MAX) || null;
	}
	return { unique, failures, duplicates };
}
