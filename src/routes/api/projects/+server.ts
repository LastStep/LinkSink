// Bearer or session; JSON on every write (see src/routes/api/links/[id]/+server.ts).
import { linksApi } from '#lib/server/api/index.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals, request }) =>
	linksApi.createProject(locals.user ?? null, request);
