import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuth, type Auth } from '../auth-config.ts';
import { links, sources } from '../db/schema.ts';
import { createProject, createTag } from '../organise.ts';
import type { Mail } from '../mail.ts';
import { createSyncWrite } from '../sync/write.ts';
import { addUser, tempDatabase } from '../test/db.ts';
import { expectVersioned, snapshot } from '../test/synced.ts';
import { createLinksApi, type Caller, type LinksApi } from './links.ts';

let t: ReturnType<typeof tempDatabase>;
let api: LinksApi;
let auth: Auth;
let sent: Mail[];
/** How many rows each API call in the test changed, checked by expectVersioned. */
let changes: number[];

beforeEach(() => {
	t = tempDatabase();
	sent = [];
	changes = [];
	api = createLinksApi({ db: t.db, syncWrite: createSyncWrite(t.db) });
	auth = createAuth({
		db: t.db,
		secret: 'unit-test-secret-unit-test-secret-0123',
		baseURL: 'http://localhost:3000',
		mailer: { send: async (m) => void sent.push(m) }
	});
});
afterEach(() => t.close());

/**
 * Calls the API as the routes do: the caller resolved from the request's headers by Better Auth (as hooks.server.ts
 * does, so a session cookie and a Bearer token both work), and every call wrapped in the versioning check: a call
 * that changes a synced table without the version rising fails the test (plan, "Risk in the code").
 */
async function call(
	headers: Headers | Caller,
	run: (api: LinksApi, caller: Caller) => Promise<Response>
) {
	const caller =
		headers instanceof Headers ? ((await auth.api.getSession({ headers }))?.user ?? null) : headers;
	const before = snapshot(t.db);
	const res = await run(api, caller);
	changes.push(expectVersioned(before, snapshot(t.db)));
	return { status: res.status, body: await res.json() };
}

const jsonRequest = (method: string, body: unknown, type = 'application/json') =>
	new Request('http://localhost/api/links', {
		method,
		headers: { 'content-type': type },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});

const post = (who: Headers | Caller, body: unknown) =>
	call(who, (a, c) => a.create(c, jsonRequest('POST', body)));
const patch = (who: Headers | Caller, id: string, body: unknown) =>
	call(who, (a, c) => a.patch(c, id, jsonRequest('PATCH', body)));
const list = (who: Headers | Caller, q = '') =>
	call(who, (a, c) => a.list(c, new URL(`http://localhost/api/links${q ? `?q=${q}` : ''}`)));

async function signedInUser() {
	const email = 'person@example.com';
	const password = 'correct horse battery staple';
	await auth.api.signUpEmail({ body: { email, password, name: email } });
	const token = new URL(sent[0].text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;
	await auth.api.verifyEmail({ query: { token } });
	const res = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
	const cookie = res.headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');
	return {
		cookie: new Headers({ cookie }),
		bearer: new Headers({ authorization: `Bearer ${res.headers.get('set-auth-token')}` }),
		id: res.response.user.id
	};
}

describe('the links API, signed in with a session cookie or a Bearer token', () => {
	it('creates with the cookie and reads it back with the Bearer token, and the other way round', async () => {
		const me = await signedInUser();
		const a = await post(me.cookie, { url: 'https://www.example.com/a/?utm_source=x' });
		expect(a.status).toBe(201);
		expect(a.body.duplicate).toBe(false);
		expect(a.body.link).toMatchObject({
			url: 'https://www.example.com/a/',
			urlKey: 'example.com/a',
			title: 'example.com',
			metaState: 'pending',
			savedVia: 'api',
			userSet: [],
			deletedAt: null
		});
		expect(a.body.link.userId).toBeUndefined();

		const b = await post(me.bearer, { url: 'https://svelte.dev/docs', via: 'paste' });
		expect(b.status).toBe(201);
		expect(b.body.link.savedVia).toBe('paste');

		const byBearer = await list(me.bearer);
		expect(byBearer.status).toBe(200);
		expect(byBearer.body.links.map((l: { id: string }) => l.id).sort()).toEqual(
			[a.body.link.id, b.body.link.id].sort()
		);
		const one = await call(me.cookie, (x, c) => x.get(c, b.body.link.id));
		expect(one.body.link.url).toBe('https://svelte.dev/docs');
	});

	it('refuses every call without a session (401) and with a made-up Bearer token', async () => {
		const nobody = new Headers();
		const fake = new Headers({ authorization: 'Bearer not-a-real-token' });
		for (const who of [nobody, fake]) {
			expect((await list(who)).status).toBe(401);
			expect((await post(who, { url: 'https://example.com/' })).status).toBe(401);
			expect((await patch(who, 'x', { title: 'x' })).status).toBe(401);
			expect((await call(who, (a, c) => a.get(c, 'x'))).status).toBe(401);
			expect((await call(who, (a, c) => a.remove(c, 'x'))).status).toBe(401);
			expect((await call(who, (a, c) => a.restore(c, 'x'))).status).toBe(401);
		}
		expect(t.db.select().from(links).all()).toEqual([]);
	});

	it("never shows or changes another user's links", async () => {
		const me = await signedInUser();
		addUser(t.db, 'other');
		const other: Caller = { id: 'other' };
		const theirs = await post(other, { url: 'https://example.com/secret' });
		expect((await list(me.bearer)).body.links).toEqual([]);
		const id = theirs.body.link.id;
		expect((await call(me.bearer, (a, c) => a.get(c, id))).status).toBe(404);
		expect((await patch(me.bearer, id, { title: 'mine now' })).status).toBe(404);
		expect((await call(me.bearer, (a, c) => a.remove(c, id))).status).toBe(404);
		expect(t.db.select().from(links).where(eq(links.id, id)).get()?.title).toBe('example.com');
		// The same address is a separate link for me.
		expect((await post(me.bearer, { url: 'https://example.com/secret' })).status).toBe(201);
	});
});

describe('POST /api/links', () => {
	const me: Caller = { id: 'u1' };
	beforeEach(() => void addUser(t.db, 'u1'));

	it('answers a duplicate with 200, the existing link and duplicate: true, and writes nothing', async () => {
		const first = await post(me, { url: 'https://example.com/post' });
		for (const again of [
			'https://example.com/post',
			'https://www.example.com/post/',
			'https://example.com/post?utm_source=newsletter#comments',
			'https://example.com:443/post?fbclid=1',
			'http://example.com/post'
		]) {
			const res = await post(me, { url: again });
			expect(res.status).toBe(200);
			expect(res.body.duplicate).toBe(true);
			expect(res.body.link.id).toBe(first.body.link.id);
		}
		expect(changes).toEqual([1, 0, 0, 0, 0, 0]);
		expect(t.db.select().from(links).all()).toHaveLength(1);
	});

	it("keeps the device's id for its optimistic row, and ignores a malformed or taken one", async () => {
		const id = '01JBK3ZQ7E8W5V6X9Y0ZABCDEF';
		expect((await post(me, { url: 'https://example.com/1', id })).body.link.id).toBe(id);
		const taken = await post(me, { url: 'https://example.com/2', id });
		expect(taken.status).toBe(201);
		expect(taken.body.link.id).not.toBe(id);
		const junk = await post(me, { url: 'https://example.com/3', id: 'robert"); drop table' });
		expect(junk.body.link.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
	});

	it("keeps a typed title as the person's own, and refuses what is not a link or not JSON", async () => {
		const titled = await post(me, { url: 'https://example.com/t', title: '  My title ' });
		expect(titled.body.link).toMatchObject({ title: 'My title', userSet: ['title'] });

		expect((await post(me, { url: 'javascript:alert(1)' })).body.error).toMatch(/http/);
		expect((await post(me, { url: 'not a link' })).status).toBe(400);
		expect((await post(me, { nope: 1 })).status).toBe(400);
		expect((await post(me, '{broken')).status).toBe(400);
		const form = await call(me, (a, c) =>
			a.create(c, jsonRequest('POST', 'url=https://example.com/f', 'text/plain'))
		);
		expect(form.status).toBe(415);
		// A client cannot claim to be the importer.
		expect(
			(await post(me, { url: 'https://example.com/i', via: 'import' })).body.link.savedVia
		).toBe('api');
	});

	it('creates a link with its tags and projects in one write (one sync version)', async () => {
		const tag = createTag(t.db, createSyncWrite(t.db), 'u1', { name: 'later' }).tag;
		const project = createProject(t.db, createSyncWrite(t.db), 'u1', {
			name: 'Trip',
			color: 'teal'
		});
		const versionBefore = snapshot(t.db).versions.get('u1') ?? 0;
		const res = await post(me, {
			url: 'https://example.com/joined',
			tagIds: [tag.id],
			projectIds: [project.id]
		});
		expect(res.status).toBe(201);
		expect(res.body.link).toMatchObject({ tagIds: [tag.id], projectIds: [project.id] });
		expect(res.body.link.tagsText).toBe('later');
		// The link and both joins are three rows, all written at the one new version.
		expect(changes.at(-1)).toBe(3);
		expect(snapshot(t.db).versions.get('u1')).toBe(versionBefore + 1);
	});

	it("refuses an unknown or another user's tag or project, and saves nothing", async () => {
		addUser(t.db, 'u2');
		const theirs = createTag(t.db, createSyncWrite(t.db), 'u2', { name: 'theirs' }).tag;
		const theirProject = createProject(t.db, createSyncWrite(t.db), 'u2', { name: 'Theirs' });
		for (const body of [
			{ tagIds: [theirs.id] },
			{ tagIds: ['01JBK3ZQ7E8W5V6X9Y0ZABCDEF'] },
			{ projectIds: [theirProject.id] },
			{ projectIds: ['nope'] },
			{ tagIds: 'x' },
			{ projectIds: [1] }
		]) {
			const res = await post(me, { url: 'https://example.com/refused', ...body });
			expect(res.status).toBe(400);
		}
		expect(t.db.select().from(links).all()).toHaveLength(0);
	});

	it('adds the tag and project to a link that is already saved, keeping what it had', async () => {
		const a = createTag(t.db, createSyncWrite(t.db), 'u1', { name: 'a' }).tag;
		const b = createTag(t.db, createSyncWrite(t.db), 'u1', { name: 'b' }).tag;
		const project = createProject(t.db, createSyncWrite(t.db), 'u1', {
			name: 'Trip',
			color: 'teal'
		});
		const first = await post(me, { url: 'https://example.com/dup', tagIds: [a.id] });
		const again = await post(me, {
			url: 'https://www.example.com/dup/',
			tagIds: [b.id],
			projectIds: [project.id]
		});
		expect(again.status).toBe(200);
		expect(again.body.duplicate).toBe(true);
		expect(again.body.link.id).toBe(first.body.link.id);
		expect([...again.body.link.tagIds].sort()).toEqual([a.id, b.id].sort());
		expect(again.body.link.projectIds).toEqual([project.id]);
		expect(t.db.select().from(links).all()).toHaveLength(1);
		// A duplicate with an unknown id is refused, not half-applied.
		expect((await post(me, { url: 'https://example.com/dup', tagIds: ['nope'] })).status).toBe(400);
	});

	it('searches with q', async () => {
		await post(me, { url: 'https://svelte.dev/a', title: 'Svelte runes' });
		await post(me, { url: 'https://example.com/b', title: 'Something else' });
		const found = await list(me, 'rune');
		expect(found.body.links.map((l: { title: string }) => l.title)).toEqual(['Svelte runes']);
	});
});

describe('PATCH /api/links/:id', () => {
	const me: Caller = { id: 'u1' };
	beforeEach(() => void addUser(t.db, 'u1'));

	it('adds title, description, source and media to user_set when it changes them, and nothing else', async () => {
		const { id } = (await post(me, { url: 'https://example.com/p' })).body.link;
		const a = await patch(me, id, { status: 'to_read', priority: 3, notes: 'read later' });
		expect(a.status).toBe(200);
		expect(a.body.link).toMatchObject({
			status: 'to_read',
			priority: 3,
			notes: 'read later',
			userSet: []
		});

		const b = await patch(me, id, { title: 'Mine', media: 'article' });
		expect(b.body.link.userSet.sort()).toEqual(['media', 'title']);
		// links.source_id references sources (T-0007's foreign key): the source must exist.
		createSyncWrite(t.db)('u1', (w) => w.insert(sources, { id: 'S1', name: 'S1', hosts: '[]' }));
		const c = await patch(me, id, { description: 'About it', sourceId: 'S1' });
		expect(c.body.link.userSet.sort()).toEqual(['description', 'media', 'source', 'title']);
		expect(c.body.link.version).toBeGreaterThan(b.body.link.version);
	});

	it('does not mark a field as hand-set, or write at all, when the value is unchanged', async () => {
		const { id, title } = (await post(me, { url: 'https://example.com/same' })).body.link;
		const res = await patch(me, id, { title });
		expect(res.body.link.userSet).toEqual([]);
		expect(changes.at(-1)).toBe(0);
	});

	it('archives and unarchives', async () => {
		const { id } = (await post(me, { url: 'https://example.com/arch' })).body.link;
		expect((await patch(me, id, { archived: true })).body.link.archivedAt).toBeTypeOf('number');
		expect((await patch(me, id, { archived: false })).body.link.archivedAt).toBeNull();
	});

	it('refuses unknown fields and bad values', async () => {
		const { id } = (await post(me, { url: 'https://example.com/bad' })).body.link;
		for (const body of [
			{ url: 'https://elsewhere.example' },
			{ version: 99 },
			{ userSet: [] },
			{ title: '' },
			{ title: 7 },
			{ media: 'movie' },
			{ status: 'later' },
			{ priority: 4 },
			{ archived: 'yes' },
			[]
		]) {
			expect((await patch(me, id, body)).status, JSON.stringify(body)).toBe(400);
		}
		expect((await patch(me, 'no-such-id', { title: 'x' })).status).toBe(404);
	});
});

describe('DELETE /api/links/:id and the undo', () => {
	const me: Caller = { id: 'u1' };
	beforeEach(() => void addUser(t.db, 'u1'));

	it('soft-deletes: the row stays with deleted_at, leaves the list, and can be restored', async () => {
		const { id } = (await post(me, { url: 'https://example.com/d' })).body.link;
		const del = await call(me, (a, c) => a.remove(c, id));
		expect(del).toEqual({ status: 200, body: { deleted: id } });
		const row = t.db.select().from(links).where(eq(links.id, id)).get()!;
		expect(row.deletedAt).toBeTypeOf('number');
		expect((await list(me)).body.links).toEqual([]);
		expect((await call(me, (a, c) => a.get(c, id))).status).toBe(404);
		expect((await patch(me, id, { title: 'x' })).status).toBe(404);
		expect((await call(me, (a, c) => a.remove(c, id))).status).toBe(404);

		const back = await call(me, (a, c) => a.restore(c, id));
		expect(back.status).toBe(200);
		expect(back.body.link).toMatchObject({ id, deletedAt: null });
		expect(back.body.link.version).toBeGreaterThan(row.version);
		expect((await list(me)).body.links.map((l: { id: string }) => l.id)).toEqual([id]);
	});

	it('lets a deleted address be saved again, and then refuses to restore the old copy', async () => {
		const old = (await post(me, { url: 'https://example.com/again' })).body.link;
		await call(me, (a, c) => a.remove(c, old.id));
		const fresh = await post(me, { url: 'https://example.com/again' });
		expect(fresh.status).toBe(201);
		expect(fresh.body.link.id).not.toBe(old.id);
		expect((await call(me, (a, c) => a.restore(c, old.id))).status).toBe(409);
	});
});

describe('the versioning check itself', () => {
	it('fails on a write that skips syncWrite, and on a hard delete', () => {
		addUser(t.db, 'u1');
		const syncWrite = createSyncWrite(t.db);
		syncWrite('u1', (w) =>
			w.insert(links, { id: 'L1', url: 'https://e.x/', urlKey: 'https://e.x', savedVia: 'api' })
		);
		let before = snapshot(t.db);
		t.db.update(links).set({ title: 'sneaky' }).where(eq(links.id, 'L1')).run();
		expect(() => expectVersioned(before, snapshot(t.db))).toThrow(/without a new version/);

		before = snapshot(t.db);
		t.db.delete(links).run();
		expect(() => expectVersioned(before, snapshot(t.db))).toThrow(/removed/);
	});

	it('passes a write through syncWrite and counts its rows', () => {
		addUser(t.db, 'u1');
		const syncWrite = createSyncWrite(t.db);
		const before = snapshot(t.db);
		syncWrite('u1', (w) =>
			w.insert(links, { id: 'L1', url: 'https://e.x/', urlKey: 'https://e.x', savedVia: 'api' })
		);
		expect(expectVersioned(before, snapshot(t.db))).toBe(1);
	});
});
