import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLinksApi, type Caller, type LinksApi } from './api/links.ts';
import { resolveSource } from './classify/source.ts';
import { createSyncWrite, type SyncWrite } from './sync/write.ts';
import { addUser, tempDatabase } from './test/db.ts';
import { expectVersioned, snapshot } from './test/synced.ts';

let t: ReturnType<typeof tempDatabase>;
let api: LinksApi;
let syncWrite: SyncWrite;
const me: Caller = { id: 'u1' };
const other: Caller = { id: 'u2' };

beforeEach(() => {
	t = tempDatabase();
	addUser(t.db, 'u1');
	addUser(t.db, 'u2');
	syncWrite = createSyncWrite(t.db);
	api = createLinksApi({ db: t.db, syncWrite });
});
afterEach(() => t.close());

const version = (user = 'u1') =>
	(
		t.db.$client.prepare('SELECT version FROM sync_meta WHERE user_id = ?').get(user) as
			{ version: number } | undefined
	)?.version ?? 0;

const req = (method: string, body?: unknown) =>
	new Request('http://localhost/api', {
		method,
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});

/** Every call checked: a synced row that changed without a new version fails the test (ADR-0001). */
async function call(run: () => Promise<Response>) {
	const before = snapshot(t.db);
	const res = await run();
	const changed = expectVersioned(before, snapshot(t.db));
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { status: res.status, body: (await res.json()) as any, changed };
}

const save = (url: string, who = me) => call(() => api.create(who, req('POST', { url })));
const tag = (name: string, who = me) => call(() => api.createTag(who, req('POST', { name })));
const project = (body: Record<string, unknown>, who = me) =>
	call(() => api.createProject(who, req('POST', body)));
const patch = (id: string, body: unknown, who = me) =>
	call(() => api.patch(who, id, req('PATCH', body)));
const list = (query = '', who = me) =>
	call(() => api.list(who, new URL(`http://localhost/api/links${query ? `?${query}` : ''}`)));
const bulk = (body: unknown, who = me) => call(() => api.bulk(who, req('POST', body)));
const organise = (who = me) => call(() => api.organise(who));

describe('the organising tables', () => {
	it('exist with partial unique indexes among live rows and the sync columns', () => {
		const sql = (name: string) =>
			(
				t.db.$client.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(name) as {
					sql: string;
				}
			).sql;
		expect(sql('tags_user_name_live')).toMatch(/WHERE "tags"."deleted_at" IS NULL/);
		expect(sql('projects_user_name_live')).toMatch(/WHERE "projects"."deleted_at" IS NULL/);
		for (const table of ['tags', 'projects', 'link_tags', 'link_projects']) {
			const cols = (t.db.$client.pragma(`table_info("${table}")`) as { name: string }[]).map(
				(c) => c.name
			);
			expect(cols).toEqual(expect.arrayContaining(['user_id', 'version', 'deleted_at']));
		}
		expect(sql('link_tags')).toMatch(/PRIMARY KEY\(`link_id`, `tag_id`\)/);
		expect(sql('link_projects')).toMatch(/PRIMARY KEY\(`link_id`, `project_id`\)/);
	});
});

describe('tags', () => {
	it('are found or made by name, stored lower-case and trimmed', async () => {
		const a = await tag('  Local  First ');
		expect(a.status).toBe(201);
		expect(a.body.tag.name).toBe('local first');
		expect(a.changed).toBe(1);
		const b = await tag('LOCAL first');
		expect(b.status).toBe(200);
		expect(b.body).toMatchObject({ existing: true, tag: { id: a.body.tag.id } });
		expect(b.changed).toBe(0);
		expect((await tag('   ')).status).toBe(400);
	});

	it('a deleted name can be made again (unique among live rows only)', async () => {
		const a = await tag('ai');
		expect((await call(() => api.deleteTag(me, a.body.tag.id))).status).toBe(200);
		const b = await tag('ai');
		expect(b.status).toBe(201);
		expect(b.body.tag.id).not.toBe(a.body.tag.id);
	});

	it('set on a link through PATCH, removed with a tombstone, re-added by clearing deleted_at', async () => {
		const link = (await save('https://a.example/1')).body.link;
		const ai = (await tag('ai')).body.tag;
		const rec = (await tag('recommendations')).body.tag;
		const set = await patch(link.id, { tagIds: [ai.id, rec.id] });
		expect(set.body.link.tagIds).toEqual([ai.id, rec.id]);
		expect(set.body.link.tagsText).toBe('ai recommendations');
		expect(set.body.link.userSet).toEqual([]);
		await patch(link.id, { tagIds: [rec.id] });
		const rows = () =>
			t.db.$client
				.prepare('SELECT tag_id, deleted_at FROM link_tags WHERE link_id = ? ORDER BY tag_id')
				.all(link.id) as { tag_id: string; deleted_at: number | null }[];
		expect(rows().find((r) => r.tag_id === ai.id)!.deleted_at).toBeTypeOf('number');
		const back = await patch(link.id, { tagIds: [rec.id, ai.id] });
		expect(rows()).toHaveLength(2);
		expect(rows().every((r) => r.deleted_at === null)).toBe(true);
		expect(back.body.link.tagIds.sort()).toEqual([ai.id, rec.id].sort());
	});

	it('refuses another user’s tag on a link', async () => {
		const link = (await save('https://a.example/1')).body.link;
		const theirs = (await tag('secret', other)).body.tag;
		expect((await patch(link.id, { tagIds: [theirs.id] })).status).toBe(400);
	});

	it('rename refuses a taken name, recolours, and refreshes tags_text without editing the link', async () => {
		const link = (await save('https://a.example/1')).body.link;
		const ai = (await tag('ai')).body.tag;
		await tag('ml');
		const tagged = (await patch(link.id, { tagIds: [ai.id] })).body.link;
		expect((await call(() => api.updateTag(me, ai.id, req('PATCH', { name: 'ML' })))).status).toBe(
			409
		);
		const renamed = await call(() =>
			api.updateTag(me, ai.id, req('PATCH', { name: 'Machine', color: 'violet' }))
		);
		expect(renamed.body.tag).toMatchObject({ name: 'machine', color: 'violet' });
		const after = (await call(() => api.get(me, link.id))).body.link;
		expect(after.tagsText).toBe('machine');
		expect(after.updatedAt).toBe(tagged.updatedAt);
		expect(
			(await call(() => api.updateTag(me, ai.id, req('PATCH', { color: 'neon' })))).status
		).toBe(400);
	});

	it('merge moves links to the kept tag and soft-deletes the other, in one write', async () => {
		const one = (await save('https://a.example/1')).body.link;
		const two = (await save('https://a.example/2')).body.link;
		const ai = (await tag('ai')).body.tag;
		const ml = (await tag('ml')).body.tag;
		await patch(one.id, { tagIds: [ml.id] });
		await patch(two.id, { tagIds: [ai.id, ml.id] });
		const v = version();
		const merged = await call(() => api.mergeTag(me, ml.id, req('POST', { into: ai.id })));
		expect(merged.status).toBe(200);
		expect(version()).toBe(v + 1);
		expect(merged.body.tag).toMatchObject({ id: ai.id, count: 2 });
		const links = (await list()).body.links;
		for (const l of links) expect(l.tagIds).toEqual([ai.id]);
		const tags = (await organise()).body.tags.map((x: { name: string }) => x.name);
		expect(tags).toEqual(['ai']);
	});

	it('delete takes the tag off every link and keeps the links', async () => {
		const link = (await save('https://a.example/1')).body.link;
		const ai = (await tag('ai')).body.tag;
		await patch(link.id, { tagIds: [ai.id] });
		await call(() => api.deleteTag(me, ai.id));
		const after = (await list()).body.links;
		expect(after).toHaveLength(1);
		expect(after[0].tagIds).toEqual([]);
		expect(after[0].tagsText).toBe('');
	});
});

describe('projects', () => {
	it('create with a colour and description, rename, recolour, reorder, refuse a taken name', async () => {
		const a = await project({ name: 'LinkSink research', description: 'What to build on' });
		expect(a.status).toBe(201);
		expect(a.body.project).toMatchObject({ name: 'LinkSink research', position: 0 });
		expect(a.body.project.color).toBeTypeOf('string');
		const b = (await project({ name: 'Self-hosting', color: 'orange' })).body.project;
		expect(b).toMatchObject({ color: 'orange', position: 1 });
		expect((await project({ name: 'self-HOSTING' })).status).toBe(409);
		const up = await call(() =>
			api.updateProject(
				me,
				b.id,
				req('PATCH', { name: 'Hosting', color: 'teal', description: 'VPS' })
			)
		);
		expect(up.body.project).toMatchObject({ name: 'Hosting', color: 'teal', description: 'VPS' });
		const order = await call(() =>
			api.reorderProjects(me, req('PUT', { ids: [b.id, a.body.project.id] }))
		);
		expect(order.body.projects.map((p: { id: string }) => p.id)).toEqual([b.id, a.body.project.id]);
		expect((await call(() => api.reorderProjects(me, req('PUT', { ids: [b.id] })))).status).toBe(
			400
		);
	});

	it('delete removes the project from its links in the same write; the links stay', async () => {
		const link = (await save('https://a.example/1')).body.link;
		const p = (await project({ name: 'Stack' })).body.project;
		await patch(link.id, { projectIds: [p.id] });
		expect((await list(`project=${p.id}`)).body.links).toHaveLength(1);
		const v = version();
		await call(() => api.deleteProject(me, p.id));
		expect(version()).toBe(v + 1);
		const joins = t.db.$client
			.prepare('SELECT deleted_at, version FROM link_projects WHERE project_id = ?')
			.all(p.id) as { deleted_at: number; version: number }[];
		expect(joins).toEqual([{ deleted_at: expect.any(Number), version: v + 1 }]);
		const after = (await list()).body.links;
		expect(after).toHaveLength(1);
		expect(after[0].projectIds).toEqual([]);
	});
});

describe('views', () => {
	it('Unsorted: live, unarchived, no tag and no project; Archive: archived only; default hides archived', async () => {
		const plain = (await save('https://a.example/plain')).body.link;
		const tagged = (await save('https://a.example/tagged')).body.link;
		const inProject = (await save('https://a.example/project')).body.link;
		const archived = (await save('https://a.example/archived')).body.link;
		const deleted = (await save('https://a.example/deleted')).body.link;
		await patch(tagged.id, { tagIds: [(await tag('x')).body.tag.id] });
		await patch(inProject.id, { projectIds: [(await project({ name: 'P' })).body.project.id] });
		await patch(archived.id, { archived: true });
		await call(() => api.remove(me, deleted.id));
		const ids = async (q: string) =>
			(await list(q)).body.links.map((l: { id: string }) => l.id).sort();
		expect(await ids('view=unsorted')).toEqual([plain.id]);
		expect(await ids('view=archive')).toEqual([archived.id]);
		expect(await ids('')).toEqual([plain.id, tagged.id, inProject.id].sort());
		expect((await list('')).body.counts).toEqual({ links: 3, unsorted: 1, archive: 1 });
		// a tag removed again puts the link back in Unsorted
		await patch(tagged.id, { tagIds: [] });
		expect(await ids('view=unsorted')).toEqual([plain.id, tagged.id].sort());
	});
});

describe('bulk', () => {
	it('sets tags, projects, status, priority and archive on many links in one syncWrite', async () => {
		const ids: string[] = [];
		for (let i = 0; i < 4; i++) ids.push((await save(`https://b.example/${i}`)).body.link.id);
		const ai = (await tag('ai')).body.tag;
		const p = (await project({ name: 'Stack' })).body.project;
		const v = version();
		const res = await bulk({
			ids: ids.slice(0, 3),
			addTagIds: [ai.id],
			addProjectIds: [p.id],
			status: 'to_read',
			priority: 3
		});
		expect(res.status).toBe(200);
		expect(version()).toBe(v + 1);
		expect(res.body.ids.sort()).toEqual(ids.slice(0, 3).sort());
		for (const l of res.body.links) {
			expect(l).toMatchObject({
				tagIds: [ai.id],
				projectIds: [p.id],
				status: 'to_read',
				priority: 3,
				version: v + 1
			});
		}
		const archived = await bulk({ ids: ids.slice(0, 2), archived: true });
		expect(version()).toBe(v + 2);
		expect(archived.body.links.every((l: { archivedAt: number }) => l.archivedAt > 0)).toBe(true);
		const restored = await bulk({ ids: ids.slice(0, 2), archived: false });
		expect(restored.body.links.every((l: { archivedAt: null }) => l.archivedAt === null)).toBe(
			true
		);
		await bulk({ ids: ids.slice(0, 3), removeTagIds: [ai.id] });
		expect((await list('view=unsorted')).body.links).toHaveLength(1);
	});

	it('keeps tags_text and projects_text in step with a bulk change of tags and projects', async () => {
		const ids: string[] = [];
		for (let i = 0; i < 2; i++) ids.push((await save(`https://t.example/${i}`)).body.link.id);
		const ai = (await tag('ai')).body.tag;
		const ml = (await tag('ml')).body.tag;
		const p = (await project({ name: 'Reading' })).body.project;
		const text = async (id: string) => {
			const l = (await call(() => api.get(me, id))).body.link;
			return [l.tagsText, l.projectsText];
		};
		await bulk({ ids, addTagIds: [ai.id, ml.id], addProjectIds: [p.id] });
		for (const id of ids) expect(await text(id)).toEqual(['ai ml', 'Reading']);
		await bulk({ ids, removeTagIds: [ai.id], removeProjectIds: [p.id] });
		for (const id of ids) expect(await text(id)).toEqual(['ml', '']);
	});

	it('deletes many in one write, skipping ids that are not the caller’s', async () => {
		const mine = (await save('https://c.example/1')).body.link.id;
		const theirs = (await save('https://c.example/1', other)).body.link.id;
		const v = version();
		const res = await bulk({ ids: [mine, theirs], deleted: true });
		expect(res.body.ids).toEqual([mine]);
		expect(version()).toBe(v + 1);
		expect((await list('', other)).body.links).toHaveLength(1);
		expect((await list()).body.links).toHaveLength(0);
	});

	it('refuses unknown fields and bad values', async () => {
		const id = (await save('https://c.example/1')).body.link.id;
		expect((await bulk({ ids: [id], title: 'x' })).status).toBe(400);
		expect((await bulk({ ids: [id], status: 'later' })).status).toBe(400);
		expect((await bulk({ ids: [] })).status).toBe(400);
		expect((await bulk({ ids: [id], addTagIds: ['nope'] })).status).toBe(400);
	});
});

describe('hand edits and dates', () => {
	it('title, description, source and media edits join user_set; status and tags do not', async () => {
		const link = (await save('https://d.example/1')).body.link;
		const youtube = t.db.$client
			.prepare(
				"INSERT INTO sources (id, user_id, name, hosts, created_at, version) VALUES ('s1', 'u1', 'YouTube', '[]', 0, 0)"
			)
			.run();
		void youtube;
		const res = await patch(link.id, {
			title: 'Mine',
			description: 'Also mine',
			sourceId: 's1',
			media: 'video',
			status: 'done',
			priority: 1
		});
		expect(res.body.link.userSet.sort()).toEqual(['description', 'media', 'source', 'title']);
	});

	it('opening records opened_at and leaves updated_at (last edited) alone', async () => {
		const link = (await save('https://d.example/1')).body.link;
		const res = await call(() => api.opened(me, link.id));
		expect(res.status).toBe(200);
		const after = (await call(() => api.get(me, link.id))).body.link;
		expect(after.openedAt).toBe(res.body.openedAt);
		expect(after.updatedAt).toBe(link.updatedAt);
		expect(after.createdAt).toBe(link.createdAt);
		expect((await call(() => api.opened(other, link.id))).status).toBe(404);
	});
});

describe('sources', () => {
	it('a renamed source is the source of later links from its hosts', async () => {
		syncWrite('u1', (w) => resolveSource(w, 'https://news.ycombinator.com/item?id=1', null));
		const hn = (await organise()).body.sources.find(
			(s: { name: string }) => s.name === 'Hacker News'
		);
		expect(hn.hosts).toEqual(['news.ycombinator.com']);
		const renamed = await call(() => api.renameSource(me, hn.id, req('PATCH', { name: 'HN' })));
		expect(renamed.body.source.name).toBe('HN');
		const later = syncWrite('u1', (w) =>
			resolveSource(w, 'https://news.ycombinator.com/item?id=2', 'Hacker News')
		);
		expect(later).toBe(hn.id);
		expect(
			(await call(() => api.renameSource(me, hn.id, req('PATCH', { name: 'youtube' })))).status
		).toBe(409);
		expect(
			(await call(() => api.renameSource(me, hn.id, req('PATCH', { hosts: [] })))).status
		).toBe(400);
	});
});
