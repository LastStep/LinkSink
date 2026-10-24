import { linksApi } from '#lib/server/api/index.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, url }) => linksApi.list(locals.user ?? null, url);
export const POST: RequestHandler = ({ locals, request }) =>
	linksApi.create(locals.user ?? null, request);
