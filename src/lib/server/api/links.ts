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
	listLinks,
	parsePatch,
	patchLink,
	restoreLink,
	RestoreConflictError,
	saveLink
} from '../links.ts';
import type { SyncWrite } from '../sync/write.ts';

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

function guard(fn: () => Promise<Response> | Response): Promise<Response> {
	return Promise.resolve()
		.then(fn)
		.catch((error: unknown) => {
			if (error instanceof UnsupportedBody) return problem(415, 'Send JSON (application/json).');
			if (error instanceof BadPatchError || error instanceof InvalidLinkError) {
				return problem(400, error.message);
			}
			if (error instanceof RestoreConflictError) return problem(409, error.message);
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
		/** GET /api/links?q= : the live links, newest first (search with q). */
		list(caller: Caller, url: URL) {
			return guard(() => {
				if (!caller) return signedIn(caller)!;
				const q = url.searchParams.get('q')?.trim() || null;
				return json({ links: listLinks(db, caller.id, q).map(linkJson) });
			});
		},

		/**
		 * POST /api/links {url, title?, id?, via?}: 201 with the new link, or 200 with the existing one and
		 * `duplicate: true` when the address is already saved (nothing is written then).
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
					via
				});
				if (!duplicate) onCreated(link.id);
				return json({ link: linkJson(link), duplicate }, duplicate ? 200 : 201);
			});
		},

		/** GET /api/links/:id : the live link, or 404. */
		get(caller: Caller, id: string) {
			return guard(() => {
				if (!caller) return signedIn(caller)!;
				const link = getLink(db, caller.id, id);
				if (!link || link.deletedAt !== null) return problem(404, 'No such link.');
				return json({ link: linkJson(link) });
			});
		},

		/** PATCH /api/links/:id : change some fields; hand edits of title, description, source, media join user_set. */
		patch(caller: Caller, id: string, request: Request) {
			return guard(async () => {
				if (!caller) return signedIn(caller)!;
				const patch = parsePatch(await readJson(request));
				const link = patchLink(db, syncWrite, caller.id, id, patch);
				if (!link) return problem(404, 'No such link.');
				return json({ link: linkJson(link) });
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
				return json({ link: linkJson(link) });
			});
		}
	};
}

export type LinksApi = ReturnType<typeof createLinksApi>;
