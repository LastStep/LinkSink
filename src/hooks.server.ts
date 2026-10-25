import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '#lib/server/auth.ts';

/**
 * The server's body limit (BODY_SIZE_LIMIT, adapter-node) is set to 21M so an import file of up to 20 MB arrives;
 * every other route keeps adapter-node's default of 512 KB here.
 */
const BODY_MAX = 512 * 1024;
const LARGE_BODY_ROUTES = ['/api/import'];

export const handle: Handle = async ({ event, resolve }) => {
	const length = Number(event.request.headers.get('content-length') ?? 0);
	if (length > BODY_MAX && !LARGE_BODY_ROUTES.includes(event.url.pathname)) {
		return new Response('Payload Too Large', { status: 413 });
	}
	if (!building) {
		const session = await auth.api.getSession({ headers: event.request.headers });
		if (session) {
			event.locals.session = session.session;
			event.locals.user = session.user;
		}
	}
	return svelteKitHandler({ event, resolve, auth, building });
};
