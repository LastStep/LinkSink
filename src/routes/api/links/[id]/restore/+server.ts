import { linksApi } from '#lib/server/api/index.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals, params }) =>
	linksApi.restore(locals.user ?? null, params.id);
