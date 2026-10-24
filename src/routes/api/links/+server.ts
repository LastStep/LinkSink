import { linksApi } from '#lib/server/api/index.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, url }) => linksApi.list(locals.user ?? null, url);
export const POST: RequestHandler = ({ locals, request }) =>
	linksApi.create(locals.user ?? null, request);

// Clients outside the browser (the iOS app, the Shortcut, scripts) authenticate with `Authorization: Bearer` and
// send `Content-Type: application/json` on every write, a body-less DELETE included: SvelteKit refuses a write with
// no content type and no matching Origin as a cross-site form post.
