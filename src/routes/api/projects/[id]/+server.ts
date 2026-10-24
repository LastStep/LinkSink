// Bearer or session; JSON on every write (see src/routes/api/links/[id]/+server.ts).
import { linksApi } from '#lib/server/api/index.ts';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = ({ locals, params, request }) =>
	linksApi.updateProject(locals.user ?? null, params.id, request);
export const DELETE: RequestHandler = ({ locals, params }) =>
	linksApi.deleteProject(locals.user ?? null, params.id);
