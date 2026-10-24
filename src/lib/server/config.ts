import { parseTestFetchAllow } from './fetch/allow.ts';
import { consoleMailer, resendMailer, type Mailer } from './mail.ts';

export interface RawEnv {
	ORIGIN?: string;
	BETTER_AUTH_SECRET?: string;
	RESEND_API_KEY?: string;
	MAIL_FROM?: string;
	MAIL_TRANSPORT?: string;
	MAIL_OUTBOX?: string;
	TEST_ONLY_FETCH_ALLOW?: string;
	NODE_ENV?: string;
}

export interface RuntimeConfig {
	origin: string;
	secret: string;
	mailer: Mailer;
	mailTransport: 'resend' | 'console';
}

/**
 * Checks the server's runtime settings when the server starts (never at build time, so a build needs no secrets).
 * Mail: `resend` needs RESEND_API_KEY and MAIL_FROM. The console mailer prints live verification and reset links
 * into the log, so outside dev it is used only when MAIL_TRANSPORT=console says so (the e2e server does); a built
 * server with no Resend key refuses to start.
 */
export function loadRuntimeConfig(env: RawEnv, { dev }: { dev: boolean }): RuntimeConfig {
	const problems: string[] = [];
	const origin = env.ORIGIN ?? '';
	if (!/^https?:\/\/[^/]+$/.test(origin)) {
		problems.push(
			'ORIGIN must be the public origin, e.g. https://links.example.com (no path, no trailing slash)'
		);
	}
	const secret = env.BETTER_AUTH_SECRET ?? '';
	if (secret.length < 32) problems.push('BETTER_AUTH_SECRET must be at least 32 characters');

	const transport = env.MAIL_TRANSPORT || (dev ? 'console' : 'resend');
	if (transport !== 'resend' && transport !== 'console') {
		problems.push(`MAIL_TRANSPORT must be resend or console, not ${JSON.stringify(transport)}`);
	}
	if (transport === 'resend') {
		if (!env.RESEND_API_KEY)
			problems.push('RESEND_API_KEY must be set (or MAIL_TRANSPORT=console outside production)');
		if (!env.MAIL_FROM) problems.push('MAIL_FROM must be set when mail goes through Resend');
	}
	try {
		parseTestFetchAllow(env.TEST_ONLY_FETCH_ALLOW, env.MAIL_TRANSPORT, env.NODE_ENV);
	} catch (error) {
		problems.push((error as Error).message);
	}
	if (problems.length) {
		throw new Error(`LinkSink cannot start:\n- ${problems.join('\n- ')}`);
	}
	const mailTransport = transport as 'resend' | 'console';
	return {
		origin,
		secret,
		mailTransport,
		mailer:
			mailTransport === 'resend'
				? resendMailer(env.RESEND_API_KEY!, env.MAIL_FROM!)
				: consoleMailer(env.MAIL_OUTBOX)
	};
}
