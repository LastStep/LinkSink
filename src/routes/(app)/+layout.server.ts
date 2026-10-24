import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// Every screen inside the app needs the signed-in person; the links themselves come through the store.
export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	return { email: locals.user.email };
};
