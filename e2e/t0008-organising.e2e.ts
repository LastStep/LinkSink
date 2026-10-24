import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

// Organising (T-0008): the picker, bulk select, Projects, Tags, Unsorted, Archive, source rename and dates. Runs after
// the other files on the same server (one worker, name order); makes the account itself when run alone. Each test
// saves its own links under its own host, so it does not lean on what the others left.
const port = Number(process.env.E2E_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const fixture = `http://127.0.0.1:${Number(process.env.E2E_FIXTURE_PORT || port + 1)}`;
const email = 'person@example.com';
const password = 'correct horse battery staple';
const state = 'data/e2e/t0008-session.json';

test.describe.configure({ mode: 'serial' });

async function signIn(request: APIRequestContext) {
	for (let attempt = 0; attempt < 6; attempt++) {
		const res = await request.post('/api/auth/sign-in/email', {
			headers: { Origin: origin },
			data: { email, password }
		});
		if (res.ok()) return;
		if (res.status() === 429) {
			const wait = Number(res.headers()['x-retry-after'] ?? '5');
			await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
			continue;
		}
		if (res.status() === 401 && sentMail().length === 0) {
			await request.post('/api/auth/sign-up/email', {
				headers: { Origin: origin },
				data: { email, password, name: email }
			});
			await request.get(linkIn(sentMail().find((m) => m.to === email)!));
			continue;
		}
		throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);
	}
	throw new Error('sign-in still rate-limited');
}

test.beforeAll(async ({ browser }) => {
	const context = await browser.newContext({
		baseURL: origin,
		storageState: { cookies: [], origins: [] }
	});
	await signIn(context.request);
	await context.storageState({ path: state });
	await context.close();
});
test.use({ storageState: state });

type Link = {
	id: string;
	title: string;
	tagIds: string[];
	projectIds: string[];
	status: string | null;
	priority: number | null;
	archivedAt: number | null;
	sourceId: string | null;
	media: string | null;
	userSet: string[];
	createdAt: number;
	updatedAt: number;
	openedAt: number | null;
	metaState: string;
};

async function api<T>(page: Page, path: string): Promise<T> {
	const res = await page.request.get(path);
	expect(res.ok()).toBe(true);
	return (await res.json()) as T;
}
const linkById = async (page: Page, id: string) =>
	(await api<{ link: Link }>(page, `/api/links/${id}`)).link;
const organise = (page: Page) =>
	api<{
		tags: { id: string; name: string; color: string | null; count: number }[];
		projects: { id: string; name: string; color: string; description: string | null }[];
		sources: { id: string; name: string; hosts: string[] }[];
	}>(page, '/api/organise');

/** Saves links through the API (the paste itself is T-0006's test) and returns them. */
async function save(page: Page, urls: string[]): Promise<Link[]> {
	const out: Link[] = [];
	for (const url of urls) {
		const res = await page.request.post('/api/links', { data: { url, via: 'paste' } });
		expect(res.ok()).toBe(true);
		out.push((await res.json()).link);
	}
	return out;
}

const row = (page: Page, host: string, path = '') =>
	page.locator('li.row', { has: page.locator(`a[href^="https://${host}${path}"]`) });

/** Clicks a row beside its title (the title itself opens the site). */
async function clickRow(
	page: Page,
	r: ReturnType<typeof row>,
	modifiers: ('Shift' | 'Control')[] = []
) {
	const cell = r.locator('.c-title');
	const box = (await cell.boundingBox())!;
	await cell.click({ position: { x: box.width - 3, y: box.height / 2 }, modifiers });
}

async function ready(page: Page, path: string) {
	await page.goto(path);
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();
}

test('the picker sets tags (find or create), projects, status, priority, source and media from the keyboard', async ({
	page
}) => {
	const [link] = await save(page, ['https://picker.example.com/one']);
	await page.request.post('/api/projects', { data: { name: 'Picker project', color: 'teal' } });
	await ready(page, '/');

	// Open the organiser from the keyboard: focus the row, then its Organise button.
	const r = row(page, 'picker.example.com');
	await r.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('complementary', { name: 'Link details' })).toBeVisible();
	await page.getByRole('button', { name: 'Organise', exact: true }).click();
	const picker = page.getByRole('dialog', { name: /^Organise/ });
	const find = picker.getByRole('combobox', { name: 'Find or create a tag' });
	await expect(find).toBeFocused();

	// Type a new tag and press Enter: it is made and set.
	await page.keyboard.type('Machine Learning');
	await expect(picker.getByRole('option', { name: /Create tag “machine learning”/ })).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(picker.getByRole('option', { name: /machine learning/ })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	// Type part of a project's name, arrow to it and toggle it with Enter.
	await find.fill('picker pro');
	await expect(picker.getByRole('listbox').getByRole('option')).toHaveCount(2); // "Create tag …" and the project
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(picker.getByRole('option', { name: /Picker project/ })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	// Status and priority are radio groups in the tab order.
	await picker
		.getByRole('radiogroup', { name: 'Status' })
		.getByRole('radio', { name: 'In progress' })
		.click();
	await picker
		.getByRole('radiogroup', { name: 'Priority' })
		.getByRole('radio', { name: 'High' })
		.click();
	await picker.getByRole('combobox', { name: 'Find or create a tag' }).focus();
	await page.keyboard.press('Escape');
	await expect(picker).toHaveCount(0);

	await expect
		.poll(async () => {
			const l = await linkById(page, link.id);
			return [l.tagIds.length, l.projectIds.length, l.status, l.priority];
		})
		.toEqual([1, 1, 'in_progress', 3]);
	const tags = (await organise(page)).tags.map((t) => t.name);
	expect(tags).toContain('machine learning');
	// The row shows the tag, the project's dot, the status and the priority.
	await expect(r.locator('.c-tags')).toContainText('machine learning');
	await expect(r.locator('.c-proj .dot')).toHaveCount(1);
	await expect(r.locator('.pill')).toHaveText('In progress');
	await expect(r.locator('.prio')).toContainText('High');
});

test('every hand edit of title, description, source and media joins user_set', async ({ page }) => {
	const [link] = await save(page, ['https://edits.example.com/page']);
	// Sources exist once any link's details were read; make sure one does for this run.
	await expect
		.poll(async () => (await organise(page)).sources.length, { timeout: 15_000 })
		.toBeGreaterThan(0);
	await ready(page, '/');
	const r = row(page, 'edits.example.com');
	await r.focus();
	await page.keyboard.press('Enter');
	const detail = page.getByRole('complementary', { name: 'Link details' });
	await expect(detail).toBeVisible();
	await detail.getByLabel('Link title').fill('My own title');
	await detail.getByLabel('Link title').press('Enter');
	await expect(r.locator('a.t')).toHaveText('My own title');
	await detail.getByPlaceholder('The page gave no summary').fill('My own words');
	await detail.getByPlaceholder('Your own thoughts').click(); // blur saves
	const source =
		(await organise(page)).sources.find((s) => s.name === 'GitHub') ??
		(await organise(page)).sources[0];
	await detail.getByRole('combobox', { name: 'Source' }).selectOption(source.id);
	await detail.getByRole('combobox', { name: 'Media' }).selectOption('repo');
	await expect
		.poll(async () => (await linkById(page, link.id)).userSet.sort(), { timeout: 5000 })
		.toEqual(['description', 'media', 'source', 'title']);
	const after = await linkById(page, link.id);
	expect(after).toMatchObject({ title: 'My own title', media: 'repo', sourceId: source.id });
	// Saved and last edited are shown.
	await expect(detail.locator('[data-field="saved"]')).not.toBeEmpty();
	await expect(detail.locator('[data-field="edited"]')).not.toBeEmpty();
});

test('bulk select with x, shift-click and long-press sets tags, projects, status, priority, archive and delete in one write each', async ({
	page
}) => {
	const links = await save(
		page,
		['a', 'b', 'c', 'd', 'e'].map((x) => `https://bulk.example.com/${x}`)
	);
	await page.request.post('/api/projects', { data: { name: 'Bulk project' } });
	await ready(page, '/');
	// x on a focused row selects it; shift-click selects the range to another row.
	const e = row(page, 'bulk.example.com', '/e');
	await e.focus();
	await page.keyboard.press('x');
	await expect(page.getByRole('toolbar', { name: 'Selected links' })).toContainText('1 selected');
	await clickRow(page, row(page, 'bulk.example.com', '/c'), ['Shift']);
	await expect(page.getByRole('toolbar', { name: 'Selected links' })).toContainText('3 selected');

	const before = (await api<{ links: Link[] }>(page, '/api/links')).links;
	void before;
	await page
		.getByRole('toolbar', { name: 'Selected links' })
		.getByRole('button', { name: 'Organise' })
		.click();
	const picker = page.getByRole('dialog', { name: 'Organise 3 links' });
	await expect(picker.getByRole('combobox', { name: 'Find or create a tag' })).toBeFocused();
	await page.keyboard.type('bulk-tag');
	await page.keyboard.press('Enter');
	await expect(picker.getByRole('option', { name: /bulk-tag/ })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await picker.getByRole('combobox').fill('Bulk project');
	await picker.getByRole('option', { name: /Bulk project/ }).click();
	await picker
		.getByRole('radiogroup', { name: 'Status' })
		.getByRole('radio', { name: 'To read' })
		.click();
	await picker
		.getByRole('radiogroup', { name: 'Priority' })
		.getByRole('radio', { name: 'Low' })
		.click();
	await picker.getByRole('button', { name: 'Done' }).click();

	const ids = links.slice(2).map((l) => l.id);
	await expect
		.poll(async () => {
			const got = await Promise.all(ids.map((id) => linkById(page, id)));
			return got.map((l) => [l.tagIds.length, l.projectIds.length, l.status, l.priority]);
		})
		.toEqual(ids.map(() => [1, 1, 'to_read', 1]));
	// The three changed in one write: one version each step, the same on every link.
	const versions = await Promise.all(
		ids.map(async (id) => (await linkById(page, id)) as Link & { version: number })
	);
	expect(new Set(versions.map((v) => v.version)).size).toBe(1);

	// Archive the three at once, with an undo.
	await page
		.getByRole('toolbar', { name: 'Selected links' })
		.getByRole('button', { name: 'Archive' })
		.click();
	await expect(row(page, 'bulk.example.com')).toHaveCount(2);
	const toast = page.getByRole('status').filter({ hasText: 'Archived 3 links' });
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(row(page, 'bulk.example.com')).toHaveCount(5);
	await expect.poll(async () => (await linkById(page, ids[0])).archivedAt).toBeNull();

	// Long-press on a phone selects; then delete the selection.
	await page.setViewportSize({ width: 390, height: 844 });
	await ready(page, '/');
	for (const x of ['a', 'b']) {
		const target = row(page, 'bulk.example.com', `/${x}`);
		await target.locator('time').dispatchEvent('pointerdown', { pointerType: 'touch' });
		await page.waitForTimeout(600);
		await target.locator('time').dispatchEvent('pointerup', { pointerType: 'touch' });
		await target.locator('time').dispatchEvent('click');
	}
	await expect(page.getByRole('toolbar', { name: 'Selected links' })).toContainText('2 selected');
	await page
		.getByRole('toolbar', { name: 'Selected links' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(row(page, 'bulk.example.com')).toHaveCount(3);
	await expect((await page.request.get(`/api/links/${links[0].id}`)).status()).toBe(404);
	await expect((await page.request.get(`/api/links/${links[1].id}`)).status()).toBe(404);
});

test('Unsorted holds links with no tag and no project; Archive holds archived ones; both moves undo', async ({
	page
}) => {
	const [loose, tagged] = await save(page, [
		'https://unsorted.example.com/loose',
		'https://unsorted.example.com/tagged'
	]);
	const tag = (await (await page.request.post('/api/tags', { data: { name: 'sorted' } })).json())
		.tag;
	await page.request.patch(`/api/links/${tagged.id}`, { data: { tagIds: [tag.id] } });

	await ready(page, '/unsorted');
	await expect(page.getByRole('heading', { name: 'Unsorted', level: 1 })).toBeVisible();
	await expect(row(page, 'unsorted.example.com', '/loose')).toHaveCount(1);
	await expect(row(page, 'unsorted.example.com', '/tagged')).toHaveCount(0);

	// Archive from the row: it leaves the list, an undo brings it back.
	const r = row(page, 'unsorted.example.com', '/loose');
	await r.hover();
	await r.getByRole('button', { name: /^Archive/ }).click();
	await expect(r).toHaveCount(0);
	const toast = page.getByRole('status').filter({ hasText: 'Archived' });
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(r).toHaveCount(1);
	// Archive it for good, find it in Archive (and not in Links), restore it with an undo there too.
	await r.hover();
	await r.getByRole('button', { name: /^Archive/ }).click();
	await expect(r).toHaveCount(0);
	await ready(page, '/');
	await expect(row(page, 'unsorted.example.com', '/loose')).toHaveCount(0);
	await ready(page, '/archive');
	const archived = row(page, 'unsorted.example.com', '/loose');
	await expect(archived).toHaveCount(1);
	await archived.hover();
	await archived.getByRole('button', { name: /^Restore/ }).click();
	await expect(archived).toHaveCount(0);
	await page
		.getByRole('status')
		.filter({ hasText: 'Restored' })
		.getByRole('button', { name: 'Undo' })
		.click();
	await expect(archived).toHaveCount(1);
	expect((await linkById(page, loose.id)).archivedAt).not.toBeNull();
	await archived.hover();
	await archived.getByRole('button', { name: /^Restore/ }).click();
	await expect.poll(async () => (await linkById(page, loose.id)).archivedAt).toBeNull();
	await ready(page, '/unsorted');
	await expect(row(page, 'unsorted.example.com', '/loose')).toHaveCount(1);
});

test('Projects: create with colour and description, rename, recolour, reorder, delete with confirmation keeping the links', async ({
	page
}) => {
	// Another project first, so the new one has a place to move up to.
	await page.request.post('/api/projects', { data: { name: 'Projects test first' } });
	await ready(page, '/projects');
	await page.getByLabel('Project name').fill('Reading list');
	await page.getByLabel('Project description').fill('Long reads for the weekend');
	await page
		.getByRole('radiogroup', { name: 'New project colour' })
		.getByRole('radio', { name: 'rose' })
		.click();
	await page.getByRole('button', { name: 'Create' }).click();
	const list = page.getByRole('list', { name: 'Projects' });
	await expect(list.getByLabel('Name of Reading list')).toBeVisible();
	let p = (await organise(page)).projects.find((x) => x.name === 'Reading list')!;
	expect(p).toMatchObject({ color: 'rose', description: 'Long reads for the weekend' });

	// It shows in the sidebar; a link put in it is listed on its page.
	await expect(
		page.getByRole('navigation', { name: 'Projects' }).getByRole('link', { name: /Reading list/ })
	).toBeVisible();
	const [link] = await save(page, ['https://projects.example.com/essay']);
	await page.request.patch(`/api/links/${link.id}`, { data: { projectIds: [p.id] } });

	// Rename, recolour.
	await list.getByLabel('Name of Reading list').fill('Weekend reading');
	await list.getByLabel('Name of Reading list').press('Enter');
	await expect(list.getByLabel('Name of Weekend reading')).toBeVisible();
	await list.getByRole('button', { name: 'Colour of Weekend reading' }).click();
	await list
		.getByRole('radiogroup', { name: 'Colour of Weekend reading' })
		.getByRole('radio', { name: 'violet' })
		.click();
	await expect
		.poll(async () => (await organise(page)).projects.find((x) => x.id === p.id)?.color)
		.toBe('violet');

	// Reorder: move it up one place.
	const order = async () => (await organise(page)).projects.map((x) => x.id);
	const was = await order();
	await list.getByRole('button', { name: 'Move Weekend reading up' }).click();
	await expect.poll(order).not.toEqual(was);
	const now = await order();
	expect(now.indexOf(p.id)).toBe(was.indexOf(p.id) - 1);

	// Delete asks first; cancel keeps it, confirm removes it from its link and keeps the link.
	await list.getByRole('button', { name: 'Delete Weekend reading' }).click();
	const confirm = page.getByRole('alertdialog', { name: 'Delete Weekend reading?' });
	await expect(confirm).toContainText('1 link stays');
	await confirm.getByRole('button', { name: 'Cancel' }).click();
	await expect(list.getByLabel('Name of Weekend reading')).toBeVisible();
	await list.getByRole('button', { name: 'Delete Weekend reading' }).click();
	await confirm.getByRole('button', { name: 'Delete project' }).click();
	await expect(list.getByLabel('Name of Weekend reading')).toHaveCount(0);
	p = (await organise(page)).projects.find((x) => x.id === p.id)!;
	expect(p).toBeUndefined();
	const after = await linkById(page, link.id);
	expect(after.projectIds).toEqual([]);
});

test('Tags: rename, merge two tags, colour, delete', async ({ page }) => {
	const [one, two] = await save(page, ['https://tags.example.com/1', 'https://tags.example.com/2']);
	const mk = async (name: string) =>
		(await (await page.request.post('/api/tags', { data: { name } })).json()).tag as { id: string };
	const js = await mk('js');
	const javascript = await mk('javascript');
	const old = await mk('old-tag');
	await page.request.patch(`/api/links/${one.id}`, { data: { tagIds: [js.id, old.id] } });
	await page.request.patch(`/api/links/${two.id}`, { data: { tagIds: [javascript.id] } });

	await ready(page, '/tags');
	const list = page.getByRole('list', { name: 'Tags' });
	// Rename to a free name.
	await list.getByLabel('Name of old-tag').fill('Legacy');
	await list.getByLabel('Name of old-tag').press('Enter');
	await expect(list.getByLabel('Name of legacy')).toBeVisible();
	// Renaming to a taken name offers the merge instead; merging moves the links.
	await list.getByLabel('Name of js').fill('javascript');
	await list.getByLabel('Name of js').press('Enter');
	const merge = page.getByRole('alertdialog', { name: 'Merge tags?' });
	await merge.getByRole('button', { name: 'Merge' }).click();
	await expect(list.getByLabel('Name of js')).toHaveCount(0);
	await expect.poll(async () => (await linkById(page, one.id)).tagIds).toContain(javascript.id);
	expect((await organise(page)).tags.find((t) => t.id === javascript.id)?.count).toBe(2);
	// Colour.
	await list.getByRole('button', { name: 'Colour of javascript' }).click();
	await list
		.getByRole('radiogroup', { name: 'Colour of javascript' })
		.getByRole('radio', { name: 'amber' })
		.click();
	await expect
		.poll(async () => (await organise(page)).tags.find((t) => t.id === javascript.id)?.color)
		.toBe('amber');
	// Delete with confirmation: the tag goes, the links stay.
	await list.getByRole('button', { name: 'Delete legacy' }).click();
	await page
		.getByRole('alertdialog', { name: 'Delete legacy?' })
		.getByRole('button', { name: 'Delete tag' })
		.click();
	await expect(list.getByLabel('Name of legacy')).toHaveCount(0);
	expect((await linkById(page, one.id)).tagIds).toEqual([javascript.id]);
});

test('renaming a source in settings applies to the next link saved from its host', async ({
	page
}) => {
	// A link from the fixture site gets its source from the host.
	const [first] = await save(page, [`${fixture}/article.html?source=first`]);
	await expect
		.poll(async () => (await linkById(page, first.id)).sourceId, { timeout: 15_000 })
		.not.toBeNull();
	const sourceId = (await linkById(page, first.id)).sourceId!;
	const was = (await organise(page)).sources.find((s) => s.id === sourceId)!;

	await ready(page, '/settings');
	const input = page.getByRole('list', { name: 'Sources' }).getByLabel(`Name of ${was.name}`);
	await input.fill('My fixture site');
	await input.press('Enter');
	await expect(
		page.getByRole('list', { name: 'Sources' }).getByLabel('Name of My fixture site')
	).toBeVisible();

	// Another link from that host takes the new name.
	const [second] = await save(page, [`${fixture}/article.html?source=second`]);
	await expect
		.poll(async () => (await linkById(page, second.id)).sourceId, { timeout: 15_000 })
		.toBe(sourceId);
	await ready(page, '/');
	const r = page.locator('li.row', {
		has: page.locator(`a[href="${fixture}/article.html?source=second"]`)
	});
	await r.focus();
	await page.keyboard.press('Enter');
	const select = page
		.getByRole('complementary', { name: 'Link details' })
		.getByRole('combobox', { name: 'Source' });
	await expect(select.locator('option:checked')).toHaveText('My fixture site');
});

test('a link shows when it was saved and edited, and opening it records opened_at', async ({
	page,
	context
}) => {
	const [link] = await save(page, ['https://dates.example.com/read']);
	expect(link.openedAt).toBeNull();
	await ready(page, '/');
	const r = row(page, 'dates.example.com');
	await expect(r.locator('time')).toHaveAttribute(
		'datetime',
		new Date(link.createdAt).toISOString()
	);
	// Opening the site from the row.
	const popup = context.waitForEvent('page');
	await r.locator('a.t').click();
	await (await popup).close();
	await expect.poll(async () => (await linkById(page, link.id)).openedAt).not.toBeNull();
	const after = await linkById(page, link.id);
	expect(after.updatedAt).toBe(link.updatedAt);
	await r.focus();
	await page.keyboard.press('Enter');
	const detail = page.getByRole('complementary', { name: 'Link details' });
	await expect(detail.locator('[data-field="opened"]')).not.toHaveText('Not yet');
	await expect(detail.locator('[data-field="saved"]')).not.toBeEmpty();
	await expect(detail.locator('[data-field="edited"]')).not.toBeEmpty();
});
