import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '#lib/server/auth.ts';
import { bodyTooLarge } from '#lib/server/body-limit.ts';

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
