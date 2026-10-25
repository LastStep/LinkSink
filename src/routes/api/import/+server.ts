import { importApi } from '#lib/server/import/app.ts';
import type { RequestHandler } from './$types';

// POST /api/import imports a file; POST /api/import?preview reads it and writes nothing (T-0019). One path, so the
// body limit's one exception (hooks.server.ts) covers both.
export const POST: RequestHandler = ({ locals, request, url }) =>
	url.searchParams.has('preview')
		? importApi.preview(locals.user ?? null, request)
		: importApi.import(locals.user ?? null, request);
