import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from './config.ts';

const base = { ORIGIN: 'https://links.example.com', BETTER_AUTH_SECRET: 'x'.repeat(32) };

describe('loadRuntimeConfig', () => {
	it('refuses to start a built server with no Resend key, rather than print live links to the log', () => {
		expect(() => loadRuntimeConfig(base, { dev: false })).toThrow(/RESEND_API_KEY must be set/);
		expect(() => loadRuntimeConfig({ ...base, RESEND_API_KEY: 're_123' }, { dev: false })).toThrow(
			/MAIL_FROM must be set/
		);
	});

	it('uses Resend on a built server when the key and sender are set', () => {
		const c = loadRuntimeConfig(
			{ ...base, RESEND_API_KEY: 're_123', MAIL_FROM: 'LinkSink <mail@example.com>' },
			{ dev: false }
		);
		expect(c.mailTransport).toBe('resend');
	});

	it('uses the console mailer only under vite dev, or when MAIL_TRANSPORT=console says so (the e2e server)', () => {
		expect(loadRuntimeConfig(base, { dev: true }).mailTransport).toBe('console');
		expect(
			loadRuntimeConfig({ ...base, MAIL_TRANSPORT: 'console' }, { dev: false }).mailTransport
		).toBe('console');
		expect(() =>
			loadRuntimeConfig({ ...base, MAIL_TRANSPORT: 'carrier-pigeon' }, { dev: false })
		).toThrow(/MAIL_TRANSPORT must be resend or console/);
	});

	it('names every missing setting at once', () => {
		let message = '';
		try {
			loadRuntimeConfig({}, { dev: false });
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toContain('ORIGIN must be the public origin');
		expect(message).toContain('BETTER_AUTH_SECRET must be at least 32 characters');
		expect(message).toContain('RESEND_API_KEY must be set');
	});

	it('refuses a short secret and an origin with a path', () => {
		expect(() =>
			loadRuntimeConfig({ ...base, BETTER_AUTH_SECRET: 'short' }, { dev: true })
		).toThrow(/BETTER_AUTH_SECRET/);
		expect(() =>
			loadRuntimeConfig({ ...base, ORIGIN: 'https://x.example/app/' }, { dev: true })
		).toThrow(/ORIGIN/);
	});
});
