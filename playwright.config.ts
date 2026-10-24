import { defineConfig, devices } from '@playwright/test';

// E2E_PORT (default 4173): two checkouts can run their e2e tests at once on different ports.
const origin = `http://127.0.0.1:${process.env.E2E_PORT || 4173}`;

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	workers: 1,
	use: { baseURL: origin, trace: 'retain-on-failure' },
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'node scripts/e2e-server.js',
		url: `${origin}/login`,
		reuseExistingServer: false,
		timeout: 180_000,
		stdout: 'pipe'
	}
});
