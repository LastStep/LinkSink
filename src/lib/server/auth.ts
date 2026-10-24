import * as env from '$app/env/private';
import { building, dev } from '$app/env';
import { getRequestEvent } from '$app/server';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { createAuth } from './auth-config.ts';
import { consoleMailer } from './mail.ts';
import { loadRuntimeConfig } from './config.ts';
import { db } from './db/index.ts';

// Checked when the server starts; while SvelteKit analyses the build, a stand-in that never serves a request.
const config = building
	? {
			origin: 'http://localhost',
			secret: 'build-time-stand-in-never-serves-a-request',
			mailer: consoleMailer()
		}
	: loadRuntimeConfig(env, { dev });

export const auth = createAuth({
	db,
	secret: config.secret,
	baseURL: config.origin,
	mailer: config.mailer,
	plugins: [sveltekitCookies(getRequestEvent)]
});
