// Builds and starts the app (adapter-node's build/) for the e2e tests, on a fresh database and mail outbox.
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const origin = 'http://127.0.0.1:4173';
// Built here so the origin is the one the server is reached at.
execSync('npx vite build', { stdio: 'inherit', env: { ...process.env, ORIGIN: origin } });

const dir = resolve('data/e2e');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

Object.assign(process.env, {
	HOST: '127.0.0.1',
	PORT: '4173',
	ORIGIN: origin,
	DATABASE_PATH: resolve(dir, 'e2e.db'),
	MAIL_OUTBOX: resolve(dir, 'outbox.jsonl'),
	BETTER_AUTH_SECRET: 'e2e-only-secret-not-used-anywhere-else-0123456789',
	RESEND_API_KEY: ''
});

await import(resolve('build/index.js'));
