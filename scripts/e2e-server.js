// Builds and starts the app (adapter-node's build/) for the e2e tests, on a fresh database and mail outbox, with a
// local fixture site beside it. E2E_PORT (default 4173) lets two checkouts run their e2e tests at once; the fixture
// site listens on E2E_FIXTURE_PORT (default E2E_PORT + 1).
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { startFixtureSite } from './e2e-fixtures.js';

const port = Number(process.env.E2E_PORT || 4173);
const fixturePort = Number(process.env.E2E_FIXTURE_PORT || port + 1);
const origin = `http://127.0.0.1:${port}`;
// Built here so the origin is the one the server is reached at.
execSync('npx vite build', { stdio: 'inherit', env: { ...process.env, ORIGIN: origin } });

const dir = resolve('data/e2e');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

await startFixtureSite(fixturePort);

Object.assign(process.env, {
	HOST: '127.0.0.1',
	PORT: String(port),
	ORIGIN: origin,
	DATABASE_PATH: resolve(dir, 'e2e.db'),
	MAIL_OUTBOX: resolve(dir, 'outbox.jsonl'),
	BETTER_AUTH_SECRET: 'e2e-only-secret-not-used-anywhere-else-0123456789',
	MAIL_TRANSPORT: 'console',
	// An import file may be 20 MB (T-0012); hooks.server.ts holds every other route to 512 KB.
	BODY_SIZE_LIMIT: '21M',
	RESEND_API_KEY: '',
	// The fetch guard's one exception, for the fixture site above; refused at startup without MAIL_TRANSPORT=console.
	TEST_ONLY_FETCH_ALLOW: `127.0.0.1:${fixturePort}`
});

await import(resolve('build/index.js'));
