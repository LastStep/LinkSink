import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLinksApi } from '../api/links.ts';
import { loadRuntimeConfig } from '../config.ts';
import { sources } from '../db/schema.ts';
import { createSyncWrite } from '../sync/write.ts';
import { addUser, tempDatabase } from '../test/db.ts';
import { parseTestFetchAllow } from './allow.ts';
import { createSafeFetch, FetchRefused, linkSinkUserAgent, PAGE_MAX_BYTES } from './safe.ts';
import { startStub, startTrap } from './test/servers.ts';

describe('POST /api/links queues the details fetch', () => {
	let t: ReturnType<typeof tempDatabase>;
	beforeEach(() => {
		t = tempDatabase();
		addUser(t.db, 'u1');
	});
	afterEach(() => t.close());

	const post = (api: ReturnType<typeof createLinksApi>, url: string) =>
		api.create(
			{ id: 'u1' },
			new Request('http://localhost/api/links', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url })
			})
		);

	it('for a new link, after its insert, and not for a duplicate', async () => {
		const queued: string[] = [];
		const api = createLinksApi({
			db: t.db,
			syncWrite: createSyncWrite(t.db),
			onCreated: (id) => queued.push(id)
		});
		const first = await post(api, 'https://blog.example/a');
		expect(first.status).toBe(201);
		const { link } = await first.json();
		expect(link.metaState).toBe('pending');
		expect(link.title).toBe('blog.example');
		expect(queued).toEqual([link.id]);
		const again = await post(api, 'https://www.blog.example/a?utm_source=x');
		expect(again.status).toBe(200);
		expect(queued).toEqual([link.id]);
	});

	it('GET /api/links/:id returns meta_state and the fetched fields the client polls', async () => {
		const api = createLinksApi({ db: t.db, syncWrite: createSyncWrite(t.db) });
		const { link } = await (await post(api, 'https://blog.example/b')).json();
		const res = await api.get({ id: 'u1' }, link.id);
		const body = await res.json();
		for (const field of [
			'metaState',
			'title',
			'description',
			'siteName',
			'author',
			'publishedAt',
			'durationS',
			'faviconPath',
			'imagePath',
			'sourceId',
			'media',
			'metaFetchedAt'
		]) {
			expect(body.link, field).toHaveProperty(field);
		}
	});
});

describe('PATCH a link’s source', () => {
	let t: ReturnType<typeof tempDatabase>;
	beforeEach(() => {
		t = tempDatabase();
		addUser(t.db, 'u1');
		addUser(t.db, 'u2');
	});
	afterEach(() => t.close());

	it('to a source that is not the person’s is a 400, not a foreign-key error', async () => {
		const syncWrite = createSyncWrite(t.db);
		const api = createLinksApi({ db: t.db, syncWrite });
		syncWrite('u2', (w) => w.insert(sources, { id: 'theirs', name: 'Theirs', hosts: '[]' }));
		syncWrite('u1', (w) => w.insert(sources, { id: 'mine', name: 'Mine', hosts: '[]' }));
		const created = await api.create(
			{ id: 'u1' },
			new Request('http://localhost/api/links', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url: 'https://blog.example/c' })
			})
		);
		const { link } = await created.json();
		const patch = (sourceId: string) =>
			api.patch(
				{ id: 'u1' },
				link.id,
				new Request('http://localhost/api/links', {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ sourceId })
				})
			);
		for (const bad of ['nope', 'theirs']) {
			const res = await patch(bad);
			expect(res.status).toBe(400);
			expect((await res.json()).error).toBe('No such source.');
		}
		const ok = await patch('mine');
		expect(ok.status).toBe(200);
		expect((await ok.json()).link.userSet).toEqual(['source']);
	});
});

describe('TEST_ONLY_FETCH_ALLOW', () => {
	const base = {
		ORIGIN: 'https://links.example.com',
		BETTER_AUTH_SECRET: 'x'.repeat(32),
		RESEND_API_KEY: 're_1',
		MAIL_FROM: 'LinkSink <m@example.com>'
	};

	it('a production server refuses to start with it', () => {
		expect(() =>
			loadRuntimeConfig({ ...base, TEST_ONLY_FETCH_ALLOW: '127.0.0.1:4174' }, { dev: false })
		).toThrow(/TEST_ONLY_FETCH_ALLOW is for the e2e server only/);
		expect(() =>
			loadRuntimeConfig(
				{ ...base, MAIL_TRANSPORT: 'resend', TEST_ONLY_FETCH_ALLOW: '127.0.0.1:4174' },
				{ dev: false }
			)
		).toThrow(/TEST_ONLY_FETCH_ALLOW/);
		// even under vite dev, unless MAIL_TRANSPORT=console says it is the e2e server
		expect(() =>
			loadRuntimeConfig({ ...base, TEST_ONLY_FETCH_ALLOW: '127.0.0.1:4174' }, { dev: true })
		).toThrow(/TEST_ONLY_FETCH_ALLOW/);
		expect(() => parseTestFetchAllow('127.0.0.1:4174', undefined)).toThrow();
	});

	it('the e2e server (MAIL_TRANSPORT=console) may set it, to 127.0.0.1:<port> only', () => {
		expect(() =>
			loadRuntimeConfig(
				{ ...base, MAIL_TRANSPORT: 'console', TEST_ONLY_FETCH_ALLOW: '127.0.0.1:4174' },
				{ dev: false }
			)
		).not.toThrow();
		expect(parseTestFetchAllow('127.0.0.1:4174', 'console')).toEqual({
			address: '127.0.0.1',
			port: 4174
		});
		expect(parseTestFetchAllow(undefined, 'resend')).toBeNull();
		expect(parseTestFetchAllow('', 'resend')).toBeNull();
		for (const bad of [
			'127.0.0.1',
			'127.0.0.1:80',
			'10.0.0.1:4174',
			'169.254.169.254:4174',
			'localhost:4174',
			'[::1]:4174',
			'127.0.0.1:4174,127.0.0.1:22',
			'0.0.0.0:4174'
		]) {
			expect(() => parseTestFetchAllow(bad, 'console'), bad).toThrow(/must be 127\.0\.0\.1:<port>/);
		}
	});
});

describe('the guard with an allowance lets exactly that address and port through', () => {
	let stub: Awaited<ReturnType<typeof startStub>>;
	let trap: Awaited<ReturnType<typeof startTrap>>;
	let safeFetch: ReturnType<typeof createSafeFetch>;
	beforeAll(async () => {
		stub = await startStub((_req, res) =>
			res.writeHead(200, { 'content-type': 'text/html' }).end('<title>fixture</title>')
		);
		trap = await startTrap();
		safeFetch = createSafeFetch({
			userAgent: linkSinkUserAgent('links.example.com'),
			allow: { address: '127.0.0.1', port: stub.port },
			resolve: async (host) => (host === 'localhost' ? ['127.0.0.1'] : ['127.0.0.1'])
		});
	});
	afterAll(async () => {
		await safeFetch.close();
		await stub.close();
		await trap.close();
	});
	const page = (url: string) => ({
		url,
		accept: 'text/html',
		maxBytes: PAGE_MAX_BYTES,
		overflow: 'truncate' as const
	});

	it('reaches the allowed fixture site', async () => {
		const res = await safeFetch(page(`http://127.0.0.1:${stub.port}/`));
		expect(res.body.toString()).toBe('<title>fixture</title>');
	});

	it.each([
		'http://127.0.0.1:TRAP/',
		'http://localhost:STUB/',
		'http://127.0.0.2:STUB/',
		'http://[::1]:STUB/',
		'http://2130706433:TRAP/',
		'http://name.test:STUB/',
		'http://169.254.169.254/'
	])('still refuses %s', async (template) => {
		trap.reset();
		const url = template.replace('TRAP', String(trap.port)).replace('STUB', String(stub.port));
		await expect(safeFetch(page(url))).rejects.toBeInstanceOf(FetchRefused);
		expect(trap.connections).toBe(0);
	});
});
