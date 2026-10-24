import { redirect } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

// The links themselves come through the store (src/lib/store/), not from here.
export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	return { q: url.searchParams.get('q')?.trim() ?? '' };
};

export const actions: Actions = {
	signOut: async ({ request }) => {
		await auth.api.signOut({ headers: request.headers });
		redirect(303, '/login');
	}
};
