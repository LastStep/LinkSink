import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '#lib/server/auth.ts';
import { bodyTooLarge } from '#lib/server/body-limit.ts';
import { kickFetches } from '#lib/server/fetch/queue.ts';

// Links still waiting for their details when the server last stopped (an import cut short) are fetched again.
if (!building) kickFetches();

export const handle: Handle = async ({ event, resolve }) => {
	const refused = await bodyTooLarge(event.request, event.url.pathname);
	if (refused) return refused;
	if (!building) {
		const session = await auth.api.getSession({ headers: event.request.headers });
		if (session) {
			event.locals.session = session.session;
			event.locals.user = session.user;
		}
	}
	return svelteKitHandler({ event, resolve, auth, building });
};
