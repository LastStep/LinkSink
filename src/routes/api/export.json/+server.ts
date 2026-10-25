import { importApi } from '#lib/server/import/app.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => importApi.exportJson(locals.user ?? null);
