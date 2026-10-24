import { fail, redirect } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.ts';
import { hasAccount } from '#lib/server/auth-config.ts';
import { authPost } from '#lib/server/auth-form.ts';
import { db } from '#lib/server/db/index.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
	return { closed: hasAccount(db) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const name = String(form.get('name') ?? '').trim() || email;
		const res = await authPost(auth, event, '/sign-up/email', {
			email,
			password,
			name,
			callbackURL: '/login?verified=1'
		});
		if (!res.ok) return fail(res.status, { email, message: res.message });
		return { sent: true, email };
	}
};
