import { importApi } from '#lib/server/import/app.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals, request }) =>
	importApi.import(locals.user ?? null, request);
