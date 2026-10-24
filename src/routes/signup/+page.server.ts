import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '#lib/server/auth.ts';
import { hasAccount } from '#lib/server/auth-config.ts';
import { db } from '#lib/server/db/index.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
	return { closed: hasAccount(db) };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const name = String(form.get('name') ?? '').trim() || email;
		try {
			await auth.api.signUpEmail({ body: { email, password, name, callbackURL: '/login?verified=1' } });
		} catch (error) {
			if (error instanceof APIError) return fail(error.statusCode, { email, message: error.message });
			throw error;
		}
		return { sent: true, email };
	}
};
