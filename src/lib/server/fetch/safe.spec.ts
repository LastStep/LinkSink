import { connect } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	createSafeFetch,
	FetchFailed,
	FetchRefused,
	linkSinkUserAgent,
	PAGE_MAX_BYTES,
	type SafeRequest
} from './safe.ts';
import { startStub, startTrap } from './test/servers.ts';

/**
 * Integration: a real listener on 127.0.0.1 (the trap) that every SSRF case aims at and none may reach, and a stub
 * "public" site. The stub is on 127.0.0.1 too; the test resolver gives its name a public address, which passes check
 * (b), and `dialFor` sends only that one validated address to the stub. The trap's own address is never mapped.
 */
const PUBLIC_STUB_IP = '93.184.216.34';
const UA = linkSinkUserAgent('links.example.com');

let trap: Awaited<ReturnType<typeof startTrap>>;
let stub: Awaited<ReturnType<typeof startStub>>;
let safeFetch: ReturnType<typeof createSafeFetch>;
let resolverCalls: string[];

const page = (url: string): SafeRequest => ({
	url,
	accept: 'text/html',
	maxBytes: PAGE_MAX_BYTES,
	overflow: 'truncate'
});

beforeAll(async () => {
	trap = await startTrap();
	stub = await startStub((req, res) => {
		const url = new URL(req.url ?? '/', 'http://stub');
		const to = url.searchParams.get('to');
		if (url.pathname === '/redirect' && to) {
			res.writeHead(302, { location: to.replace('TRAP', String(trap.port)) }).end();
		} else if (url.pathname.startsWith('/chain/')) {
			const n = Number(url.pathname.split('/')[2]);
			if (n > 0) res.writeHead(301, { location: `/chain/${n - 1}` }).end();
			else res.writeHead(200, { 'content-type': 'text/html' }).end('<title>end</title>');
		} else if (url.pathname === '/slow') {
			// never answers
		} else if (url.pathname === '/big') {
			res.writeHead(200, { 'content-type': 'text/html' });
			res.end(Buffer.alloc(2 * 1024 * 1024, 'a'));
		} else if (url.pathname === '/gzip') {
			res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
			res.end(gzipSync('<title>zipped</title>'));
		} else {
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<title>ok</title>');
		}
	});
	const table: Record<string, string[]> = {
		'public.test': [PUBLIC_STUB_IP],
		'127.0.0.1.nip.io': ['127.0.0.1'],
		'rebind.test': [PUBLIC_STUB_IP, '127.0.0.1'],
		'v6loop.test': ['::1'],
		'mapped.test': ['::ffff:7f00:1'],
		'metadata.test': ['169.254.169.254'],
		localhost: ['127.0.0.1']
	};
	safeFetch = createSafeFetch({
		userAgent: UA,
		ports: new Set([80, 443, trap.port, stub.port]),
		timeoutMs: 1_000,
		resolve: async (host) => {
			resolverCalls.push(host);
			const answer = table[host];
			if (!answer) throw new Error(`ENOTFOUND ${host}`);
			return answer;
		},
		dialFor: (address, port) => {
			if (address === PUBLIC_STUB_IP && port === stub.port)
				return { host: '127.0.0.1', port: stub.port };
			// Every other address is dialled as it is, so a check that let one through would reach the trap.
			return { host: address, port };
		}
	});
});

afterAll(async () => {
	await safeFetch.close();
	await stub.close();
	await trap.close();
});

beforeEach(() => {
	resolverCalls = [];
	stub.seen.length = 0;
});

describe('the trap', () => {
	it('counts a connection when one is made (so a zero below means something)', async () => {
		trap.reset();
		await new Promise<void>((resolve, reject) => {
			const socket = connect(trap.port, '127.0.0.1', () => {
				socket.end();
				resolve();
			});
			socket.on('error', reject);
		});
		await new Promise((r) => setTimeout(r, 50));
		expect(trap.connections).toBe(1);
		trap.reset();
	});
});

describe('safe fetch refuses every case in the SSRF list; the trap is never reached', () => {
	const cases = [
		'http://localhost:TRAP/',
		'http://127.0.0.1:TRAP/',
		'http://2130706433:TRAP/',
		'http://0x7f000001:TRAP/',
		'http://0177.0.0.1:TRAP/',
		'http://127.1:TRAP/',
		'http://[::1]:TRAP/',
		'http://[::ffff:127.0.0.1]:TRAP/',
		'http://127.0.0.1.nip.io:TRAP/',
		'http://169.254.169.254:TRAP/latest/meta-data/',
		'http://10.0.0.1:TRAP/',
		'http://rebind.test:TRAP/',
		'http://v6loop.test:TRAP/',
		'http://mapped.test:TRAP/',
		'http://metadata.test:TRAP/'
	];

	it.each(cases)('%s', async (template) => {
		trap.reset();
		const url = template.replace('TRAP', String(trap.port));
		await expect(safeFetch(page(url))).rejects.toBeInstanceOf(FetchRefused);
		await new Promise((r) => setTimeout(r, 20));
		expect(trap.connections).toBe(0);
	});

	it.each([
		'http://127.0.0.1:TRAP/',
		'http://[::ffff:127.0.0.1]:TRAP/',
		'http://2130706433:TRAP/',
		'http://localhost:TRAP/',
		'http://127.0.0.1.nip.io:TRAP/',
		'http://rebind.test:TRAP/'
	])('a redirect from a public stub to %s', async (target) => {
		trap.reset();
		const url = `http://public.test:${stub.port}/redirect?to=${encodeURIComponent(target)}`;
		await expect(safeFetch(page(url))).rejects.toBeInstanceOf(FetchRefused);
		expect(stub.seen.map((s) => s.path)).toEqual([`/redirect?to=${encodeURIComponent(target)}`]);
		await new Promise((r) => setTimeout(r, 20));
		expect(trap.connections).toBe(0);
	});

	it('never asks the resolver about an IP literal', async () => {
		await expect(safeFetch(page(`http://127.0.0.1:${trap.port}/`))).rejects.toThrow(FetchRefused);
		await expect(safeFetch(page(`http://[::1]:${trap.port}/`))).rejects.toThrow(FetchRefused);
		expect(resolverCalls).toEqual([]);
	});

	it('refuses other schemes and ports before connecting', async () => {
		const fetchDefaultPorts = createSafeFetch({
			userAgent: UA,
			resolve: async () => [PUBLIC_STUB_IP]
		});
		await expect(fetchDefaultPorts(page(`http://public.test:${stub.port}/`))).rejects.toThrow(
			/port/
		);
		await expect(fetchDefaultPorts(page('file:///etc/passwd'))).rejects.toThrow(/only http/);
		await expect(fetchDefaultPorts(page('ftp://public.test/'))).rejects.toThrow(/only http/);
		await fetchDefaultPorts.close();
		expect(stub.seen).toEqual([]);
	});
});

describe('safe fetch on an allowed site', () => {
	it('fetches, sending only the honest User-Agent and the asked Accept', async () => {
		const response = await safeFetch(page(`http://public.test:${stub.port}/hello`));
		expect(response.status).toBe(200);
		expect(response.body.toString()).toBe('<title>ok</title>');
		expect(response.contentType).toBe('text/html; charset=utf-8');
		expect(stub.seen).toHaveLength(1);
		expect(stub.seen[0].headers['user-agent']).toBe('LinkSink/1.0 (+https://links.example.com)');
		expect(stub.seen[0].headers.accept).toBe('text/html');
		expect(stub.seen[0].headers.cookie).toBeUndefined();
		// A kept-alive connection from an earlier test may be reused (it was validated when it was made).
		expect(resolverCalls.every((h) => h === 'public.test')).toBe(true);
	});

	it('follows 5 redirects, each re-checked, and refuses a sixth', async () => {
		const five = await safeFetch(page(`http://public.test:${stub.port}/chain/5`));
		expect(five.status).toBe(200);
		expect(five.hops).toHaveLength(6);
		expect(five.url).toBe(`http://public.test:${stub.port}/chain/0`);
		await expect(safeFetch(page(`http://public.test:${stub.port}/chain/6`))).rejects.toMatchObject({
			name: 'FetchFailed',
			reason: 'redirects'
		});
	});

	it('gives up after the deadline', async () => {
		const started = performance.now();
		await expect(safeFetch(page(`http://public.test:${stub.port}/slow`))).rejects.toMatchObject({
			reason: 'timeout'
		});
		expect(performance.now() - started).toBeLessThan(2_000);
	});

	it('caps a page at 1 MB, keeping the start', async () => {
		const response = await safeFetch(page(`http://public.test:${stub.port}/big`));
		expect(response.body.length).toBe(1024 * 1024);
		expect(response.truncated).toBe(true);
	});

	it('fails instead of truncating when asked to (images)', async () => {
		await expect(
			safeFetch({ ...page(`http://public.test:${stub.port}/big`), overflow: 'fail' })
		).rejects.toBeInstanceOf(FetchFailed);
	});

	it('stops reading once the caller has enough', async () => {
		const response = await safeFetch({
			...page(`http://public.test:${stub.port}/big`),
			enough: (bytes) => bytes.length > 1000
		});
		expect(response.body.length).toBeLessThan(1024 * 1024);
		expect(response.truncated).toBe(false);
	});

	it('decodes a gzipped body', async () => {
		const response = await safeFetch(page(`http://public.test:${stub.port}/gzip`));
		expect(response.body.toString()).toBe('<title>zipped</title>');
	});
});

describe('the 8 s deadline holds back to back', () => {
	// Timed on the monotonic clock: this machine's wall clock (WSL) steps forward about 3 s every so often, which
	// made Date.now() report 11 s for a request that took 8 (measured: wall gap 3081 ms, monotonic gap 100 ms).
	it('two hung requests in a row each end within 8.5 s', async () => {
		const hung = await startStub(() => {}); // never answers
		const fetchDefaultDeadline = createSafeFetch({
			userAgent: UA,
			ports: new Set([hung.port]),
			resolve: async () => [PUBLIC_STUB_IP],
			dialFor: () => ({ host: '127.0.0.1', port: hung.port })
		});
		try {
			for (let i = 0; i < 2; i++) {
				const started = performance.now();
				await expect(
					fetchDefaultDeadline(page(`http://public.test:${hung.port}/hang`))
				).rejects.toMatchObject({ reason: 'timeout' });
				const took = performance.now() - started;
				expect(took).toBeGreaterThanOrEqual(7_900);
				expect(took).toBeLessThanOrEqual(8_500);
			}
		} finally {
			await fetchDefaultDeadline.close();
			await hung.close();
		}
	}, 25_000);
});
