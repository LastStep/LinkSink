import type { TestAllowance } from './safe.ts';

/**
 * TEST_ONLY_FETCH_ALLOW: the e2e server's one hole in the fetch guard, `127.0.0.1:<port>` of its local fixture site.
 * Accepted only beside MAIL_TRANSPORT=console (which only the e2e server sets); anywhere else the server refuses to
 * start. Any other form (another address, a name, no port) is refused too.
 */
export function parseTestFetchAllow(
	value: string | undefined,
	mailTransport: string | undefined
): TestAllowance | null {
	if (!value) return null;
	if (mailTransport !== 'console') {
		throw new Error(
			'TEST_ONLY_FETCH_ALLOW is for the e2e server only (with MAIL_TRANSPORT=console); unset it in production'
		);
	}
	const m = /^127\.0\.0\.1:(\d{2,5})$/.exec(value.trim());
	const port = m ? Number(m[1]) : NaN;
	if (!m || port < 1024 || port > 65535) {
		throw new Error(`TEST_ONLY_FETCH_ALLOW must be 127.0.0.1:<port>, not ${JSON.stringify(value)}`);
	}
	return { address: '127.0.0.1', port };
}
