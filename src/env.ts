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
	MAIL_OUTBOX: {
		description:
			'Dev and tests only: a file the console mailer also appends each message to, one JSON per line.',
		schema: optional
	}
});
