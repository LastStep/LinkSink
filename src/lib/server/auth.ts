import {
	BETTER_AUTH_SECRET,
	MAIL_FROM,
	MAIL_OUTBOX,
	ORIGIN,
	RESEND_API_KEY
} from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { createAuth } from './auth-config.ts';
import { db } from './db/index.ts';
import { createMailer } from './mail.ts';

export const auth = createAuth({
	db,
	secret: BETTER_AUTH_SECRET,
	baseURL: ORIGIN,
	mailer: createMailer({ RESEND_API_KEY, MAIL_FROM, MAIL_OUTBOX }),
	plugins: [sveltekitCookies(getRequestEvent)]
});
