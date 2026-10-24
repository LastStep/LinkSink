// Organising (plan P-T-0002, step 6): tags, projects, the links in them, source names, and changes to many links at
// once. Every write goes through syncWrite (ADR-0001); removing a tag or a project from a link soft-deletes the
// joining row, and adding it again clears `deleted_at`, so other devices see both.
import { and, asc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { COLORS, PRIORITIES, STATUSES, type Color } from '../fields.ts';
import type { ProjectJson, SourceJson, TagJson, ViewCounts } from '../store/types.ts';
import { ULID_PATTERN } from '../ulid.ts';
import type { DB } from './db/open.ts';
import { links, linkProjects, linkTags, projects, sources, tags } from './db/schema.ts';
import { BadPatchError } from './links.ts';
import type { SyncWrite, SyncWriter } from './sync/write.ts';
import { ulid } from './ulid.ts';

/** A change that collides with what is already there (a name taken); its message is safe to show. */
export class ConflictError extends Error {}

const NAME_MAX = 64;
const DESCRIPTION_MAX = 1_000;
const BULK_MAX = 500;

/** A tag's name as stored: trimmed, inner spaces collapsed, lower-case. */
export function tagName(input: unknown): string {
	if (typeof input !== 'string') throw new BadPatchError('A tag needs a name.');
	const name = input.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
	if (!name) throw new BadPatchError('A tag needs a name.');
	if (name.length > NAME_MAX)
		throw new BadPatchError(`A tag name is at most ${NAME_MAX} characters.`);
	return name;
}

/** A project's or a source's name as stored: trimmed, inner spaces collapsed, case kept. */
export function displayName(input: unknown, what: string): string {
	if (typeof input !== 'string') throw new BadPatchError(`A ${what} needs a name.`);
	const name = input.normalize('NFKC').trim().replace(/\s+/g, ' ');
	if (!name) throw new BadPatchError(`A ${what} needs a name.`);
	if (name.length > NAME_MAX)
		throw new BadPatchError(`A ${what} name is at most ${NAME_MAX} characters.`);
	return name;
}

function color(input: unknown, nullable: boolean): Color | null {
	if (input === null && nullable) return null;
	if (!COLORS.includes(input as Color)) {
		throw new BadPatchError(`colour must be one of ${COLORS.join(', ')}.`);
	}
	return input as Color;
}

const wantedId = (input: unknown) =>
	typeof input === 'string' && ULID_PATTERN.test(input) ? input : null;

function idList(input: unknown, field: string, max = BULK_MAX): string[] {
	if (!Array.isArray(input) || input.some((v) => typeof v !== 'string' || v.length > 64)) {
		throw new BadPatchError(`${field} must be a list of ids.`);
	}
	if (input.length > max) throw new BadPatchError(`${field} holds at most ${max} ids.`);
	return [...new Set(input as string[])];
}

// ---------- reading ----------

const liveLink = (userId: string) => and(eq(links.userId, userId), isNull(links.deletedAt));

/** The live tag and project ids of each of the user's links in `linkIds`. */
export function organisingOf(
	db: DB | SyncWriter['tx'],
	userId: string,
	linkIds: string[]
): Map<string, { tagIds: string[]; projectIds: string[] }> {
	const out = new Map<string, { tagIds: string[]; projectIds: string[] }>();
	for (const id of linkIds) out.set(id, { tagIds: [], projectIds: [] });
	for (let i = 0; i < linkIds.length; i += 500) {
		const chunk = linkIds.slice(i, i + 500);
		const t = db
			.select({ linkId: linkTags.linkId, id: linkTags.tagId })
			.from(linkTags)
			.innerJoin(tags, eq(tags.id, linkTags.tagId))
			.where(
				and(
					eq(linkTags.userId, userId),
					inArray(linkTags.linkId, chunk),
					isNull(linkTags.deletedAt),
					isNull(tags.deletedAt)
				)
			)
			.orderBy(asc(tags.name))
			.all();
		for (const r of t) out.get(r.linkId)?.tagIds.push(r.id);
		const p = db
			.select({ linkId: linkProjects.linkId, id: linkProjects.projectId })
			.from(linkProjects)
			.innerJoin(projects, eq(projects.id, linkProjects.projectId))
			.where(
				and(
					eq(linkProjects.userId, userId),
					inArray(linkProjects.linkId, chunk),
					isNull(linkProjects.deletedAt),
					isNull(projects.deletedAt)
				)
			)
			.orderBy(asc(projects.position))
			.all();
		for (const r of p) out.get(r.linkId)?.projectIds.push(r.id);
	}
	return out;
}

/** SQL: the link has no live tag and no live project. */
export const unsortedSql = sql`NOT EXISTS (SELECT 1 FROM link_tags lt WHERE lt.link_id = "links"."id" AND lt.deleted_at IS NULL)
	AND NOT EXISTS (SELECT 1 FROM link_projects lp WHERE lp.link_id = "links"."id" AND lp.deleted_at IS NULL)`;

/** How many live links each list holds: every unarchived link, Unsorted, and Archive. */
export function viewCounts(db: DB, userId: string): ViewCounts {
	const count = (where: SQL | undefined) =>
		db
			.select({ n: sql<number>`count(*)` })
			.from(links)
			.where(where)
			.get()!.n;
	return {
		links: count(and(liveLink(userId), isNull(links.archivedAt))),
		unsorted: count(and(liveLink(userId), isNull(links.archivedAt), unsortedSql)),
		archive: count(and(liveLink(userId), isNotNull(links.archivedAt)))
	};
}

/** The user's live tags, by name, each with how many live unarchived links carry it. */
export function listTags(db: DB, userId: string): TagJson[] {
	return db
		.select({
			id: tags.id,
			name: tags.name,
			color: tags.color,
			createdAt: tags.createdAt,
			count: sql<number>`(SELECT count(*) FROM link_tags lt JOIN links l ON l.id = lt.link_id
				WHERE lt.tag_id = "tags"."id" AND lt.deleted_at IS NULL AND l.deleted_at IS NULL AND l.archived_at IS NULL)`
		})
		.from(tags)
		.where(and(eq(tags.userId, userId), isNull(tags.deletedAt)))
		.orderBy(asc(tags.name))
		.all() as TagJson[];
}

/** The user's live projects, in their order, each with how many live unarchived links it holds. */
export function listProjects(db: DB, userId: string): ProjectJson[] {
	return db
		.select({
			id: projects.id,
			name: projects.name,
			color: projects.color,
			description: projects.description,
			position: projects.position,
			createdAt: projects.createdAt,
			count: sql<number>`(SELECT count(*) FROM link_projects lp JOIN links l ON l.id = lp.link_id
				WHERE lp.project_id = "projects"."id" AND lp.deleted_at IS NULL AND l.deleted_at IS NULL AND l.archived_at IS NULL)`
		})
		.from(projects)
		.where(and(eq(projects.userId, userId), isNull(projects.deletedAt)))
		.orderBy(asc(projects.position), asc(projects.createdAt))
		.all() as ProjectJson[];
}

/** The user's live sources, by name, with their host suffixes. */
export function listSources(db: DB, userId: string): SourceJson[] {
	return db
		.select({ id: sources.id, name: sources.name, hosts: sources.hosts })
		.from(sources)
		.where(and(eq(sources.userId, userId), isNull(sources.deletedAt)))
		.orderBy(sql`${sources.name} COLLATE NOCASE`)
		.all()
		.map((s) => ({ ...s, hosts: JSON.parse(s.hosts) as string[] }));
}

// ---------- the links' tags and projects ----------

type Join = typeof linkTags | typeof linkProjects;
const otherColumn = (table: Join) => (table === linkTags ? linkTags.tagId : linkProjects.projectId);

/**
 * Makes `ids` the live set of tags (or projects) on a link, inside the caller's write: rows no longer wanted are
 * soft-deleted, wanted rows that were removed before come back, new ones are inserted. Returns whether anything
 * changed.
 */
function setJoin(w: SyncWriter, table: Join, linkId: string, ids: string[]): boolean {
	const col = otherColumn(table);
	const rows = w.tx
		.select({ id: col, deletedAt: table.deletedAt })
		.from(table)
		.where(and(eq(table.userId, w.userId), eq(table.linkId, linkId)))
		.all();
	const want = new Set(ids);
	let changed = false;
	for (const row of rows) {
		if (row.deletedAt === null && !want.has(row.id)) {
			w.softDelete(table, and(eq(table.linkId, linkId), eq(col, row.id))!);
			changed = true;
		} else if (row.deletedAt !== null && want.has(row.id)) {
			w.update(table, and(eq(table.linkId, linkId), eq(col, row.id))!, {
				deletedAt: null,
				createdAt: w.now
			});
			changed = true;
		}
	}
	const known = new Set(rows.map((r) => r.id));
	for (const id of want) {
		if (known.has(id)) continue;
		if (table === linkTags) w.insert(linkTags, { linkId, tagId: id });
		else w.insert(linkProjects, { linkId, projectId: id });
		changed = true;
	}
	return changed;
}

/**
 * Refreshes `tags_text` and `projects_text` (the search index's view of a link's tags and projects) on the given
 * links, inside the caller's write. Leaves `updated_at` as it was: renaming a tag is not an edit of every link.
 */
function refreshSearchText(w: SyncWriter, linkIds: string[], touch: boolean) {
	if (linkIds.length === 0) return;
	const org = organisingOf(w.tx, w.userId, linkIds);
	const tagNames = new Map(
		w.tx
			.select({ id: tags.id, name: tags.name })
			.from(tags)
			.where(eq(tags.userId, w.userId))
			.all()
			.map((t) => [t.id, t.name])
	);
	const projectNames = new Map(
		w.tx
			.select({ id: projects.id, name: projects.name })
			.from(projects)
			.where(eq(projects.userId, w.userId))
			.all()
			.map((p) => [p.id, p.name])
	);
	for (const [id, { tagIds, projectIds }] of org) {
		const current = w.tx
			.select({ updatedAt: links.updatedAt, t: links.tagsText, p: links.projectsText })
			.from(links)
			.where(eq(links.id, id))
			.get();
		if (!current) continue;
		const tagsText = tagIds.map((t) => tagNames.get(t)).join(' ');
		const projectsText = projectIds.map((p) => projectNames.get(p)).join(' ');
		if (!touch && current.t === tagsText && current.p === projectsText) continue;
		w.update(links, eq(links.id, id), {
			tagsText,
			projectsText,
			...(touch ? {} : { updatedAt: current.updatedAt })
		});
	}
}

function checkOwned(
	db: DB | SyncWriter['tx'],
	userId: string,
	table: typeof tags | typeof projects,
	ids: string[]
) {
	if (ids.length === 0) return;
	const found = db
		.select({ id: table.id })
		.from(table)
		.where(and(eq(table.userId, userId), isNull(table.deletedAt), inArray(table.id, ids)))
		.all();
	if (found.length !== ids.length) {
		throw new BadPatchError(table === tags ? 'No such tag.' : 'No such project.');
	}
}

/**
 * Sets a link's tags and/or projects (whole sets), inside the caller's write. The ids must be the user's live tags
 * and projects. Marks the link edited when anything changed.
 */
export function setOrganising(
	w: SyncWriter,
	linkId: string,
	set: { tagIds?: string[]; projectIds?: string[] }
): boolean {
	let changed = false;
	if (set.tagIds) {
		checkOwned(w.tx, w.userId, tags, set.tagIds);
		changed = setJoin(w, linkTags, linkId, set.tagIds) || changed;
	}
	if (set.projectIds) {
		checkOwned(w.tx, w.userId, projects, set.projectIds);
		changed = setJoin(w, linkProjects, linkId, set.projectIds) || changed;
	}
	if (changed) refreshSearchText(w, [linkId], true);
	return changed;
}

// ---------- tags ----------

function tagByName(db: DB | SyncWriter['tx'], userId: string, name: string) {
	return (
		db
			.select()
			.from(tags)
			.where(and(eq(tags.userId, userId), eq(tags.name, name), isNull(tags.deletedAt)))
			.get() ?? null
	);
}

const tagJson = (db: DB, userId: string, id: string) =>
	listTags(db, userId).find((t) => t.id === id) ?? null;

/** Makes a tag, or returns the live one of that name (`existing: true`): typing a known name finds it. */
export function createTag(
	db: DB,
	syncWrite: SyncWrite,
	userId: string,
	body: { name?: unknown; id?: unknown; color?: unknown }
): { tag: TagJson; existing: boolean } {
	const name = tagName(body.name);
	const c = body.color === undefined ? null : color(body.color, true);
	const found = tagByName(db, userId, name);
	if (found) return { tag: tagJson(db, userId, found.id)!, existing: true };
	const id = syncWrite(userId, (w) => {
		const wanted = wantedId(body.id);
		const taken =
			wanted && w.tx.select({ id: tags.id }).from(tags).where(eq(tags.id, wanted)).get();
		const id = wanted && !taken ? wanted : ulid(w.now);
		w.insert(tags, { id, name, color: c });
		return id;
	});
	return { tag: tagJson(db, userId, id)!, existing: false };
}

/** Renames or recolours a tag. A name another tag has is refused: merging is its own action. */
export function updateTag(
	db: DB,
	syncWrite: SyncWrite,
	userId: string,
	id: string,
	body: Record<string, unknown>
): TagJson | null {
	const tag = tagJson(db, userId, id);
	if (!tag) return null;
	const set: { name?: string; color?: string | null } = {};
	for (const [field, value] of Object.entries(body)) {
		if (field === 'name') set.name = tagName(value);
		else if (field === 'color') set.color = color(value, true);
		else throw new BadPatchError(`${field} cannot be changed.`);
	}
	if (set.name !== undefined) {
		if (set.name === tag.name) delete set.name;
		else if (tagByName(db, userId, set.name)) {
			throw new ConflictError(
				`There is already a tag called “${set.name}”. Merge the two instead.`
			);
		}
	}
	if (Object.keys(set).length === 0) return tag;
	syncWrite(userId, (w) => {
		w.update(tags, and(eq(tags.id, id), isNull(tags.deletedAt))!, set);
		if (set.name !== undefined) refreshSearchText(w, linksWith(w, linkTags, id), false);
	});
	return tagJson(db, userId, id);
}

function linksWith(w: SyncWriter, table: Join, otherId: string): string[] {
	return w.tx
		.select({ id: table.linkId })
		.from(table)
		.where(
			and(eq(table.userId, w.userId), eq(otherColumn(table), otherId), isNull(table.deletedAt))
		)
		.all()
		.map((r) => r.id);
}

/** Deletes a tag: it leaves every link (soft-deleted joins), the links stay. False if there was no such tag. */
export function deleteTag(syncWrite: SyncWrite, userId: string, id: string): boolean {
	return syncWrite(userId, (w) => {
		const affected = linksWith(w, linkTags, id);
		if (w.softDelete(tags, eq(tags.id, id)) === 0) return false;
		w.softDelete(linkTags, eq(linkTags.tagId, id));
		refreshSearchText(w, affected, false);
		return true;
	});
}

/**
 * Merges tag `fromId` into `intoId` in one write: every link with `fromId` gets `intoId` (if it lacks it), the
 * `fromId` joins and the tag itself are soft-deleted. Returns the kept tag, or null if either is not a live tag.
 */
export function mergeTags(
	db: DB,
	syncWrite: SyncWrite,
	userId: string,
	fromId: string,
	intoId: string
): TagJson | null {
	if (fromId === intoId) throw new BadPatchError('A tag cannot be merged into itself.');
	if (!tagJson(db, userId, fromId) || !tagJson(db, userId, intoId)) return null;
	syncWrite(userId, (w) => {
		const affected = linksWith(w, linkTags, fromId);
		for (const linkId of affected) {
			const current = organisingOf(w.tx, userId, [linkId]).get(linkId)!.tagIds;
			const next = current.filter((t) => t !== fromId);
			if (!next.includes(intoId)) next.push(intoId);
			setJoin(w, linkTags, linkId, next);
		}
		w.softDelete(tags, eq(tags.id, fromId));
		refreshSearchText(w, affected, false);
	});
	return tagJson(db, userId, intoId);
}

// ---------- projects ----------

function projectByName(db: DB, userId: string, name: string, except?: string) {
	return (
		db
			.select({ id: projects.id })
			.from(projects)
			.where(
				and(
					eq(projects.userId, userId),
					sql`${projects.name} = ${name} COLLATE NOCASE`,
					isNull(projects.deletedAt),
					except ? sql`${projects.id} <> ${except}` : undefined
				)
			)
			.get() ?? null
	);
}

const projectJson = (db: DB, userId: string, id: string) =>
	listProjects(db, userId).find((p) => p.id === id) ?? null;

/** Makes a project at the end of the order, with the next unused colour unless one is given. */
export function createProject(
	db: DB,
	syncWrite: SyncWrite,
	userId: string,
	body: { name?: unknown; color?: unknown; description?: unknown; id?: unknown }
): ProjectJson {
	const name = displayName(body.name, 'project');
	const description =
		body.description === undefined || body.description === null || body.description === ''
			? null
			: describe(body.description);
	if (projectByName(db, userId, name)) {
		throw new ConflictError(`There is already a project called “${name}”.`);
	}
	const existing = listProjects(db, userId);
	const c =
		body.color === undefined
			? COLORS[existing.length % (COLORS.length - 1)]
			: (color(body.color, false) as Color);
	const id = syncWrite(userId, (w) => {
		const wanted = wantedId(body.id);
		const taken =
			wanted &&
			w.tx.select({ id: projects.id }).from(projects).where(eq(projects.id, wanted)).get();
		const id = wanted && !taken ? wanted : ulid(w.now);
		const position = Math.max(0, ...existing.map((p) => p.position + 1));
		w.insert(projects, { id, name, color: c, description, position });
		return id;
	});
	return projectJson(db, userId, id)!;
}

function describe(value: unknown): string | null {
	if (value === null) return null;
	if (typeof value !== 'string') throw new BadPatchError('description must be text or null.');
	const text = value.trim();
	if (text.length > DESCRIPTION_MAX) {
		throw new BadPatchError(`description is longer than ${DESCRIPTION_MAX} characters.`);
	}
	return text || null;
}

/** Renames, recolours or redescribes a project. */
export function updateProject(
	db: DB,
	syncWrite: SyncWrite,
	userId: string,
	id: string,
	body: Record<string, unknown>
): ProjectJson | null {
	const project = projectJson(db, userId, id);
	if (!project) return null;
	const set: { name?: string; color?: string; description?: string | null } = {};
	for (const [field, value] of Object.entries(body)) {
		if (field === 'name') set.name = displayName(value, 'project');
		else if (field === 'color') set.color = color(value, false)!;
		else if (field === 'description') set.description = describe(value);
		else throw new BadPatchError(`${field} cannot be changed.`);
	}
	if (set.name !== undefined && projectByName(db, userId, set.name, id)) {
		throw new ConflictError(`There is already a project called “${set.name}”.`);
	}
	if (Object.keys(set).length === 0) return project;
	syncWrite(userId, (w) => {
		w.update(projects, and(eq(projects.id, id), isNull(projects.deletedAt))!, set);
		if (set.name !== undefined) refreshSearchText(w, linksWith(w, linkProjects, id), false);
	});
	return projectJson(db, userId, id);
}

/** Deletes a project: it leaves its links (soft-deleted joins), which stay. False if there was no such project. */
export function deleteProject(syncWrite: SyncWrite, userId: string, id: string): boolean {
	return syncWrite(userId, (w) => {
		const affected = linksWith(w, linkProjects, id);
		if (w.softDelete(projects, eq(projects.id, id)) === 0) return false;
		w.softDelete(linkProjects, eq(linkProjects.projectId, id));
		refreshSearchText(w, affected, false);
		return true;
	});
}

/** Puts the projects in the order given (every live project's id, once). */
export function reorderProjects(
	db: DB,
	syncWrite: SyncWrite,
	userId: string,
	body: { ids?: unknown }
): ProjectJson[] {
	const ids = idList(body.ids, 'ids');
	const current = listProjects(db, userId);
	if (ids.length !== current.length || current.some((p) => !ids.includes(p.id))) {
		throw new BadPatchError('Send every project id once, in the new order.');
	}
	syncWrite(userId, (w) => {
		ids.forEach((id, position) => {
			if (current.find((p) => p.id === id)!.position !== position) {
				w.update(projects, eq(projects.id, id), { position });
			}
		});
	});
	return listProjects(db, userId);
}

// ---------- sources ----------

/**
 * Renames a source. Later links from its hosts still match it by host (src/lib/server/classify/source.ts), so they
 * take the new name. A name another source has is refused.
 */
export function renameSource(
	db: DB,
	syncWrite: SyncWrite,
	userId: string,
	id: string,
	body: Record<string, unknown>
): SourceJson | null {
	const keys = Object.keys(body);
	if (keys.some((k) => k !== 'name'))
		throw new BadPatchError('Only a source’s name can be changed.');
	const name = displayName(body.name, 'source');
	const all = listSources(db, userId);
	if (!all.some((s) => s.id === id)) return null;
	if (all.some((s) => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) {
		throw new ConflictError(`There is already a source called “${name}”.`);
	}
	syncWrite(userId, (w) =>
		w.update(sources, and(eq(sources.id, id), isNull(sources.deletedAt))!, { name })
	);
	return listSources(db, userId).find((s) => s.id === id) ?? null;
}

// ---------- many links at once ----------

export interface BulkChange {
	ids: string[];
	addTagIds?: string[];
	removeTagIds?: string[];
	addProjectIds?: string[];
	removeProjectIds?: string[];
	status?: string | null;
	priority?: number | null;
	archived?: boolean;
	deleted?: true;
}

/** Checks a bulk body; unknown fields are refused. */
export function parseBulk(body: unknown): BulkChange {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		throw new BadPatchError('Send a JSON object.');
	}
	const out: BulkChange = { ids: [] };
	for (const [field, value] of Object.entries(body)) {
		switch (field) {
			case 'ids':
			case 'addTagIds':
			case 'removeTagIds':
			case 'addProjectIds':
			case 'removeProjectIds':
				out[field] = idList(value, field);
				break;
			case 'status':
				if (value !== null && !STATUSES.includes(value as never)) {
					throw new BadPatchError(`status must be null or one of ${STATUSES.join(', ')}.`);
				}
				out.status = value as string | null;
				break;
			case 'priority':
				if (value !== null && !PRIORITIES.includes(value as never)) {
					throw new BadPatchError('priority must be null, 1, 2 or 3.');
				}
				out.priority = value as number | null;
				break;
			case 'archived':
				if (typeof value !== 'boolean') throw new BadPatchError('archived must be true or false.');
				out.archived = value;
				break;
			case 'deleted':
				if (value !== true) throw new BadPatchError('deleted must be true.');
				out.deleted = true;
				break;
			default:
				throw new BadPatchError(`${field} cannot be changed.`);
		}
	}
	if (out.ids.length === 0) throw new BadPatchError('Send the links’ ids.');
	return out;
}

/**
 * Applies one change to many of the user's live links in a single syncWrite (one version for all of them). Returns
 * the ids it changed; ids that are not the user's live links are skipped.
 */
export function bulkChange(
	db: DB,
	syncWrite: SyncWrite,
	userId: string,
	change: BulkChange
): string[] {
	const live = db
		.select({
			id: links.id,
			archivedAt: links.archivedAt,
			status: links.status,
			priority: links.priority
		})
		.from(links)
		.where(and(liveLink(userId), inArray(links.id, change.ids)))
		.all();
	if (live.length === 0) return [];
	const ids = live.map((l) => l.id);
	return syncWrite(userId, (w) => {
		if (change.deleted) {
			w.softDelete(links, inArray(links.id, ids));
			return ids;
		}
		checkOwned(w.tx, userId, tags, [...(change.addTagIds ?? []), ...(change.removeTagIds ?? [])]);
		checkOwned(w.tx, userId, projects, [
			...(change.addProjectIds ?? []),
			...(change.removeProjectIds ?? [])
		]);
		const changed = new Set<string>();
		const touchesJoins =
			change.addTagIds?.length ||
			change.removeTagIds?.length ||
			change.addProjectIds?.length ||
			change.removeProjectIds?.length;
		if (touchesJoins) {
			const org = organisingOf(w.tx, userId, ids);
			for (const id of ids) {
				const { tagIds, projectIds } = org.get(id)!;
				const t = new Set(tagIds);
				change.addTagIds?.forEach((x) => t.add(x));
				change.removeTagIds?.forEach((x) => t.delete(x));
				const p = new Set(projectIds);
				change.addProjectIds?.forEach((x) => p.add(x));
				change.removeProjectIds?.forEach((x) => p.delete(x));
				const a = setJoin(w, linkTags, id, [...t]);
				const b = setJoin(w, linkProjects, id, [...p]);
				if (a || b) changed.add(id);
			}
			refreshSearchText(w, [...changed], true);
		}
		for (const link of live) {
			const set: Partial<typeof links.$inferInsert> = {};
			if (change.status !== undefined && link.status !== change.status) set.status = change.status;
			if (change.priority !== undefined && link.priority !== change.priority) {
				set.priority = change.priority;
			}
			if (change.archived !== undefined && (link.archivedAt !== null) !== change.archived) {
				set.archivedAt = change.archived ? w.now : null;
			}
			if (Object.keys(set).length === 0) continue;
			w.update(links, eq(links.id, link.id), set);
			changed.add(link.id);
		}
		return [...changed];
	});
}

/** Records that the person opened the link now; not an edit, so `updated_at` stays. */
export function markOpened(
	db: DB,
	syncWrite: SyncWrite,
	userId: string,
	id: string
): number | null {
	const link = db
		.select({ updatedAt: links.updatedAt })
		.from(links)
		.where(and(liveLink(userId), eq(links.id, id)))
		.get();
	if (!link) return null;
	return syncWrite(userId, (w) => {
		w.update(links, eq(links.id, id), { openedAt: w.now, updatedAt: link.updatedAt });
		return w.now;
	});
}
