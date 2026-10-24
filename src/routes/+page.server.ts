import { fail, redirect } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.ts';
import { db, syncWrite } from '#lib/server/db/index.ts';
import { addLink, listLinks } from '#lib/server/links.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	const q = url.searchParams.get('q')?.trim() ?? '';
	return { q, links: listLinks(db, locals.user.id, q) };
};

export const actions: Actions = {
	add: async ({ locals, request }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const url = String(form.get('url') ?? '');
		const title = String(form.get('title') ?? '');
		try {
			addLink(syncWrite, locals.user.id, { url, title });
		} catch (error) {
			const message =
				error instanceof TypeError
					? 'That is not a link.'
					: String((error as Error).message).includes('UNIQUE')
						? 'That link is already saved.'
						: (error as Error).message;
			return fail(400, { url, title, message });
		}
		return { added: true };
	},
	signOut: async ({ request }) => {
		await auth.api.signOut({ headers: request.headers });
		redirect(303, '/login');
	}
};
