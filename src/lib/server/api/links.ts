// The links JSON API (POST/GET/PATCH/DELETE /api/links), free of SvelteKit imports so unit tests can call it on
// their own database. The routes in src/routes/api/links/ only hand it the signed-in user (session cookie or
// Bearer token, resolved in hooks.server.ts). Every write goes through syncWrite (ADR-0001).
import { SAVED_VIA, type SavedVia } from '../../fields.ts';
import type { DB } from '../db/open.ts';
import {
	BadPatchError,
	deleteLink,
	getLink,
	InvalidLinkError,
	linkJson,
	linksJson,
	parsePatch,
	parseView,
	patchLink,
	restoreLink,
	RestoreConflictError,
	saveLink
} from '../links.ts';
import {
	bulkChange,
	ConflictError,
	createProject,
	createTag,
	deleteProject,
	deleteTag,
	listProjects,
	listSources,
	listTags,
	markOpened,
	mergeTags,
	parseBulk,
	renameSource,
	reorderProjects,
	updateProject,
	updateTag,
	viewCounts
} from '../organise.ts';
import { searchLinks } from '../search.ts';
import type { SyncWrite } from '../sync/write.ts';
import { parseFilters } from '../../search/filters.ts';

/** Who is calling: the signed-in user's id, or null. */
export type Caller = { id: string } | null;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const problem = (status: number, message: string) => json({ error: message }, status);

/** Saved-via values a client may claim; `import` belongs to the importer. */
const CLIENT_VIA = SAVED_VIA.filter((v) => v !== 'import');

async function readJson(request: Request): Promise<unknown> {
	// JSON only: a cross-site form or text/plain post can carry the cookie, a JSON one cannot without CORS.
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
		throw new UnsupportedBody();
	}
	try {
		return await request.json();
	} catch {
		throw new BadPatchError('The body is not valid JSON.');
	}
}
class UnsupportedBody extends Error {}

function objectBody(body: unknown): Record<string, unknown> {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		throw new BadPatchError('Send a JSON object.');
	}
	return body as Record<string, unknown>;
}

/** An optional list of ids (text) from a body; anything else is a bad request. */
function idList(value: unknown, field: string): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
		throw new BadPatchError(`${field} must be a list of ids.`);
	}
	return value as string[];
}

function guard(fn: () => Promise<Response> | Response): Promise<Response> {
	return Promise.resolve()
		.then(fn)
		.catch((error: unknown) => {
			if (error instanceof UnsupportedBody) return problem(415, 'Send JSON (application/json).');
			if (error instanceof BadPatchError || error instanceof InvalidLinkError) {
				return problem(400, error.message);
			}
			if (error instanceof RestoreConflictError || error instanceof ConflictError) {
				return problem(409, error.message);
			}
			console.error('[api/links] failed', error);
			return problem(500, 'Something went wrong. Try again.');
		});
}

export function createLinksApi({
	db,
	syncWrite,
	onCreated = () => {}
}: {
	db: DB;
	syncWrite: SyncWrite;
	/** Called with a new link's id after its insert (not for a duplicate): the app queues its page details fetch. */
	onCreated?: (linkId: string) => void;
}) {
	const signedIn = (caller: Caller) => (caller ? null : problem(401, 'Sign in first.'));

	return {
		/**
		 * GET /api/links?q=&view=unsorted|archive&project=<id>&tag=<id> and the filters of src/lib/search/filters.ts
		 * (source, media, tags, tagmode, projects, status, priority, archived, sort): one page of the live links in a
		 * view (every unarchived link by default), 50 by default (`limit`, up to 200), the next page from `after` (the
		 * last page's `next`); with each view's count and, on a first page, `total`, how many match in all.
		 */
		list(caller: Caller, url: URL) {
			return guard(() => {
				if (!caller) return signedIn(caller)!;
				const params = url.searchParams;
				const page = searchLinks(db, caller.id, parseView(params), parseFilters(params), {
					after: params.get('after'),
					limit: Number(params.get('limit')) || undefined
				});
				return json({
					links: linksJson(db, caller.id, page.links),
					next: page.next,
					total: page.total,
					counts: viewCounts(db, caller.id)
				});
			});
		},

		/**
		 * POST /api/links {url, title?, id?, via?, tagIds?, projectIds?}: 201 with the new link, or 200 with the existing one and
		 * `duplicate: true` when the address is already saved (then only the given tags and projects are added to it).
		 */
		create(caller: Caller, request: Request) {
			return guard(async () => {
				if (!caller) return signedIn(caller)!;
				const body = (await readJson(request)) as Record<string, unknown> | null;
				if (!body || typeof body.url !== 'string') throw new BadPatchError('Send {"url": "..."}.');
				const title = typeof body.title === 'string' ? body.title : null;
				const id = typeof body.id === 'string' ? body.id : null;
				const via = (CLIENT_VIA as readonly unknown[]).includes(body.via)
					? (body.via as SavedVia)
					: 'api';
				const { link, duplicate } = saveLink(db, syncWrite, caller.id, {
					url: body.url,
					title,
					id,
					via,
					tagIds: idList(body.tagIds, 'tagIds'),
					projectIds: idList(body.projectIds, 'projectIds')
				});
				if (!duplicate) onCreated(link.id);
				return json({ link: linkJson(db, link), duplicate }, duplicate ? 200 : 201);
			});
		},

		/** GET /api/links/:id : the live link, or 404. */
		get(caller: Caller, id: string) {
			return guard(() => {
				if (!caller) return signedIn(caller)!;
				const link = getLink(db, caller.id, id);
				if (!link || link.deletedAt !== null) return problem(404, 'No such link.');
				return json({ link: linkJson(db, link) });
			});
		},

		/** PATCH /api/links/:id : change some fields; hand edits of title, description, source, media join user_set. */
		patch(caller: Caller, id: string, request: Request) {
			return guard(async () => {
				if (!caller) return signedIn(caller)!;
				const patch = parsePatch(await readJson(request));
				const link = patchLink(db, syncWrite, caller.id, id, patch);
				if (!link) return problem(404, 'No such link.');
				return json({ link: linkJson(db, link) });
			});
		},

		/** DELETE /api/links/:id : soft delete (a tombstone other devices pull); 404 if there is no live link. */
		remove(caller: Caller, id: string) {
			return guard(() => {
				if (!caller) return signedIn(caller)!;
				if (!deleteLink(syncWrite, caller.id, id)) return problem(404, 'No such link.');
				return json({ deleted: id });
			});
		},

		/** POST /api/links/:id/restore : undo a delete; 409 if the address was saved again since. */
		restore(caller: Caller, id: string) {
			return guard(() => {
				if (!caller) return signedIn(caller)!;
				const link = restoreLink(db, syncWrite, caller.id, id);
				if (!link) return problem(404, 'No such link.');
				return json({ link: linkJson(db, link) });
			});
		},

		/** POST /api/links/:id/opened : records that the person opened the link now. */
		opened(caller: Caller, id: string) {
			return guard(() => {
				if (!caller) return signedIn(caller)!;
				const at = markOpened(db, syncWrite, caller.id, id);
				if (at === null) return problem(404, 'No such link.');
				return json({ openedAt: at });
			});
		},

		/**
		 * POST /api/links/bulk {ids, addTagIds?, removeTagIds?, addProjectIds?, removeProjectIds?, status?,
		 * priority?, archived?, deleted?} : one change to many links in one write; answers with the changed links.
		 */
		bulk(caller: Caller, request: Request) {
			return guard(async () => {
				if (!caller) return signedIn(caller)!;
				const change = parseBulk(await readJson(request));
				const ids = bulkChange(db, syncWrite, caller.id, change);
				const rows = ids
					.map((id) => getLink(db, caller.id, id))
					.filter((l): l is NonNullable<typeof l> => l !== null);
				return json({ ids, links: linksJson(db, caller.id, rows) });
			});
		},

		/** GET /api/organise : the tags, projects and sources, and each view's count. */
		organise(caller: Caller) {
			return guard(() => {
				if (!caller) return signedIn(caller)!;
				return json({
					tags: listTags(db, caller.id),
					projects: listProjects(db, caller.id),
					sources: listSources(db, caller.id),
					counts: viewCounts(db, caller.id)
				});
			});
		},

		/** POST /api/tags {name, id?, color?} : 201 with a new tag, or 200 with the live tag of that name. */
		createTag(caller: Caller, request: Request) {
			return guard(async () => {
				if (!caller) return signedIn(caller)!;
				const body = (await readJson(request)) as Record<string, unknown>;
				const { tag, existing } = createTag(db, syncWrite, caller.id, body ?? {});
				return json({ tag, existing }, existing ? 200 : 201);
			});
		},

		/** PATCH /api/tags/:id {name?, color?} ; 409 when the name is another tag's. */
		updateTag(caller: Caller, id: string, request: Request) {
			return guard(async () => {
				if (!caller) return signedIn(caller)!;
				const tag = updateTag(db, syncWrite, caller.id, id, objectBody(await readJson(request)));
				return tag ? json({ tag }) : problem(404, 'No such tag.');
			});
		},

		/** DELETE /api/tags/:id : the tag leaves every link; the links stay. */
		deleteTag(caller: Caller, id: string) {
			return guard(() => {
				if (!caller) return signedIn(caller)!;
				return deleteTag(syncWrite, caller.id, id)
					? json({ deleted: id })
					: problem(404, 'No such tag.');
			});
		},

		/** POST /api/tags/:id/merge {into} : the tag's links get `into`, and the tag goes. */
		mergeTag(caller: Caller, id: string, request: Request) {
			return guard(async () => {
				if (!caller) return signedIn(caller)!;
				const body = objectBody(await readJson(request));
				if (typeof body.into !== 'string') throw new BadPatchError('Send {"into": "<tag id>"}.');
				const tag = mergeTags(db, syncWrite, caller.id, id, body.into);
				return tag ? json({ tag }) : problem(404, 'No such tag.');
			});
		},

		/** POST /api/projects {name, color?, description?, id?} */
		createProject(caller: Caller, request: Request) {
			return guard(async () => {
				if (!caller) return signedIn(caller)!;
				const project = createProject(
					db,
					syncWrite,
					caller.id,
					objectBody(await readJson(request))
				);
				return json({ project }, 201);
			});
		},

		/** PATCH /api/projects/:id {name?, color?, description?} */
		updateProject(caller: Caller, id: string, request: Request) {
			return guard(async () => {
				if (!caller) return signedIn(caller)!;
				const project = updateProject(
					db,
					syncWrite,
					caller.id,
					id,
					objectBody(await readJson(request))
				);
				return project ? json({ project }) : problem(404, 'No such project.');
			});
		},

		/** DELETE /api/projects/:id : the project leaves its links; the links stay. */
		deleteProject(caller: Caller, id: string) {
			return guard(() => {
				if (!caller) return signedIn(caller)!;
				return deleteProject(syncWrite, caller.id, id)
					? json({ deleted: id })
					: problem(404, 'No such project.');
			});
		},

		/** PUT /api/projects/order {ids} : every project's id once, in the new order. */
		reorderProjects(caller: Caller, request: Request) {
			return guard(async () => {
				if (!caller) return signedIn(caller)!;
				const body = objectBody(await readJson(request));
				return json({ projects: reorderProjects(db, syncWrite, caller.id, body) });
			});
		},

		/** PATCH /api/sources/:id {name} : later links from its hosts take the new name. */
		renameSource(caller: Caller, id: string, request: Request) {
			return guard(async () => {
				if (!caller) return signedIn(caller)!;
				const source = renameSource(
					db,
					syncWrite,
					caller.id,
					id,
					objectBody(await readJson(request))
				);
				return source ? json({ source }) : problem(404, 'No such source.');
			});
		}
	};
}

export type LinksApi = ReturnType<typeof createLinksApi>;
