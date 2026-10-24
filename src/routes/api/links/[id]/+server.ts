import { linksApi } from '#lib/server/api/index.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, params }) =>
	linksApi.get(locals.user ?? null, params.id);
export const PATCH: RequestHandler = ({ locals, params, request }) =>
	linksApi.patch(locals.user ?? null, params.id, request);
export const DELETE: RequestHandler = ({ locals, params }) =>
	linksApi.remove(locals.user ?? null, params.id);
