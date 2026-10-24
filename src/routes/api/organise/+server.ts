// Bearer or session; JSON on every write (see src/routes/api/links/[id]/+server.ts).
import { linksApi } from '#lib/server/api/index.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => linksApi.organise(locals.user ?? null);
