import { fail, redirect } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.ts';
import { authPost } from '#lib/server/auth-form.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, '/');
	return { verified: url.searchParams.has('verified') };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const res = await authPost(auth, event, '/sign-in/email', { email, password });
		if (!res.ok && res.code === 'EMAIL_NOT_VERIFIED')
			return fail(res.status, { email, message: res.message, resent: true });
		if (!res.ok) return fail(res.status, { email, message: res.message, resent: false });
		redirect(303, '/');
	}
};
