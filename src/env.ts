import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => (value ? value : undefined);

export const variables = defineEnvVars({
	DATABASE_PATH: {
		description: 'Path of the SQLite database file, e.g. `data/linksink.db`.',
		schema: (value) => value || 'data/linksink.db'
	},
	ORIGIN: {
		schema: optional,
		description:
			'The public origin of the app, e.g. `https://links.example.com`. Better Auth builds its links from it.'
	},
	BETTER_AUTH_SECRET: {
		description: 'Secret Better Auth signs with: at least 32 random characters in production.',
		schema: optional
	},
	RESEND_API_KEY: {
		description:
			'Resend API key. When set, mail goes through Resend; when empty, it is printed to the console.',
		schema: optional
	},
	MAIL_FROM: {
		description:
			'The From address of mail sent through Resend, e.g. `LinkSink <mail@example.com>`.',
		schema: optional
	},
	MAIL_TRANSPORT: {
		description:
			'`resend` or `console`. Default: console under `vite dev`, resend everywhere else. Checked at server start.',
		schema: optional
	},
	NODE_ENV: {
		description:
			'`production` on the VPS. Read at runtime only to refuse TEST_ONLY_FETCH_ALLOW there.',
		schema: optional
	},
	TEST_ONLY_FETCH_ALLOW: {
		description:
			'e2e server only: `127.0.0.1:<port>` of its local fixture site, the one address the fetch guard lets through. The server refuses to start with it unless MAIL_TRANSPORT=console.',
		schema: optional
	},
	MAIL_OUTBOX: {
		description:
			'Dev and tests only: a file the console mailer also appends each message to, one JSON per line.',
		schema: optional
	}
});
