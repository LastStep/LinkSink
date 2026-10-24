import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/** Pages anyone may open; every other page needs the signed-in person. */
const PUBLIC = ['/login', '/signup', '/logout'];

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (PUBLIC.includes(url.pathname)) return { email: null };
	if (!locals.user) redirect(303, '/login');
	return { email: locals.user.email };
};
