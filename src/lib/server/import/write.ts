// Writes an import's links (T-0012): each address once (by url_key, against the user's saved links and within the
// file), in batches of 500 links per syncWrite (ADR-0001), each batch making the tags and projects it needs.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { COLORS } from '../../fields.ts';
import { cleanUrl, displayHost, normalise } from '../../url.ts';
import { linkProjects, links, linkTags, projects, tags } from '../db/schema.ts';
import { displayName, tagName } from '../organise.ts';
import type { SyncWrite, SyncWriter } from '../sync/write.ts';
import { ulid } from '../ulid.ts';
import type { ImportFailure, ImportItem } from './types.ts';

export const IMPORT_BATCH = 500;
const NAME_MAX = 64;
const TITLE_MAX = 500;
const NOTES_MAX = 20_000;

export interface ImportResult {
	added: number;
	/** Skipped: already saved, or a second time in the file (its tags and projects join the first). */
	duplicates: number;
	failures: ImportFailure[];
	/** The new links' ids, in file order. */
	addedIds: string[];
}

interface Unique extends ImportItem {
	key: string;
	clean: string;
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
		const ids: string[] = [];
		for (const item of batch) {
			if (saved.has(item.key)) continue;
			const tagNames = [
				...new Set(item.tags.map((t) => named(t, tagName)).filter((t) => t !== null))
			].sort();
			const projectNames = [
				...new Set(
					item.projects
						.map((p) => named(p, (s) => displayName(s, 'project')))
						.filter((p) => p !== null)
				)
			];
			const id = ulid(w.now);
			const title = item.title?.trim().slice(0, TITLE_MAX) || null;
			const createdAt = item.createdAt ?? w.now;
			w.insert(links, {
				id,
				url: item.clean,
				urlKey: item.key,
				title: title ?? displayHost(item.clean),
				notes: item.notes?.slice(0, NOTES_MAX) || null,
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
			for (const name of projectNames) {
				w.insert(linkProjects, { linkId: id, projectId: names.project(name) });
			}
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
			first.notes ??= item.notes;
			continue;
		}
		byKey.set(key, { ...item, tags: [...item.tags], projects: [...item.projects], key, clean });
	}
	const unique = [...byKey.values()];
	const addedIds: string[] = [];
	for (let i = 0; i < unique.length; i += IMPORT_BATCH) {
		const batch = unique.slice(i, i + IMPORT_BATCH);
		const ids = writeBatch(syncWrite, userId, batch);
		duplicates += batch.length - ids.length;
		addedIds.push(...ids);
		for (const id of ids) onCreated(id);
	}
	return { added: addedIds.length, duplicates, failures, addedIds };
}
