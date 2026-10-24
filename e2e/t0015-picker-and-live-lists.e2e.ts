import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

// The picker opens on the right kind and every list follows the store (T-0015: BUG-001, BUG-002). Runs after
// the other files on the same server (one worker, name order); makes the account itself when run alone. Each test
// saves its own links under its own host, so it does not lean on what the others left.
const port = Number(process.env.E2E_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const email = 'person@example.com';
const password = 'correct horse battery staple';
const state = 'data/e2e/t0015-session.json';

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
	archivedAt: number | null;
};

const linkById = async (page: Page, id: string) => {
	const res = await page.request.get(`/api/links/${id}`);
	expect(res.ok()).toBe(true);
	return ((await res.json()) as { link: Link }).link;
};

async function save(page: Page, urls: string[]): Promise<Link[]> {
	const out: Link[] = [];
	for (const url of urls) {
		const res = await page.request.post('/api/links', { data: { url, via: 'paste' } });
		expect(res.ok()).toBe(true);
		out.push((await res.json()).link);
	}
	return out;
}
const makeTag = async (page: Page, name: string) =>
	(await (await page.request.post('/api/tags', { data: { name } })).json()).tag as { id: string };
const makeProject = async (page: Page, name: string) =>
	(await (await page.request.post('/api/projects', { data: { name, color: 'teal' } })).json())
		.project as { id: string };
const tagLink = (page: Page, id: string, tagIds: string[], projectIds: string[] = []) =>
	page.request.patch(`/api/links/${id}`, { data: { tagIds, projectIds } });

const row = (page: Page, host: string, path = '') =>
	page.locator('li.row', { has: page.locator(`a[href^="https://${host}${path}"]`) });

/** Clicks a row beside its title (the title itself opens the site), which opens its details. */
async function openDetails(page: Page, r: ReturnType<typeof row>) {
	const cell = r.locator('.c-title');
	const box = (await cell.boundingBox())!;
	await cell.click({ position: { x: box.width - 3, y: box.height / 2 } });
	const details = page.getByRole('complementary', { name: 'Link details' });
	await expect(details).toBeVisible();
	return details;
}

async function ready(page: Page, path: string) {
	await page.goto(path);
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();
}

test('Add to project opens the projects picker: it picks a project and creates a new one', async ({
	page
}) => {
	const [link] = await save(page, ['https://t15-project.example.com/one']);
	const existing = await makeProject(page, 'T15 existing');
	await makeTag(page, 't15 tag only');
	await ready(page, '/');
	const details = await openDetails(page, row(page, 't15-project.example.com'));

	await details.getByRole('button', { name: 'Add to project' }).click();
	const picker = page.getByRole('dialog', { name: /^Organise/ });
	const find = picker.getByRole('combobox', { name: 'Find or create a project' });
	await expect(find).toBeFocused();
	// Projects only: the tag made above is not offered.
	await expect(picker.getByRole('option', { name: /t15 tag only/ })).toHaveCount(0);
	await picker.getByRole('option', { name: /T15 existing/ }).click();
	await expect(picker.getByRole('option', { name: /T15 existing/ })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect.poll(async () => (await linkById(page, link.id)).projectIds).toEqual([existing.id]);

	// A new name makes a project (not a tag) and adds the link to it.
	await find.fill('T15 brand new');
	await expect(
		picker.getByRole('option', { name: /Create project “t15 brand new”/ })
	).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(picker.getByRole('option', { name: /t15 brand new/i })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect.poll(async () => (await linkById(page, link.id)).projectIds.length).toBe(2);
	const projects = (await (await page.request.get('/api/organise')).json()).projects as {
		name: string;
	}[];
	expect(projects.map((p) => p.name)).toContain('t15 brand new');
	const tags = (await (await page.request.get('/api/organise')).json()).tags as { name: string }[];
	expect(tags.map((t) => t.name)).not.toContain('t15 brand new');
	await page.keyboard.press('Escape');
	await expect(picker).toHaveCount(0);
	await expect(details.getByText('t15 brand new')).toBeVisible();
});

test('Add tag still opens the tags picker and creates a new tag', async ({ page }) => {
	const [link] = await save(page, ['https://t15-tag.example.com/one']);
	await makeProject(page, 'T15 project not shown');
	await ready(page, '/');
	const details = await openDetails(page, row(page, 't15-tag.example.com'));

	await details.getByRole('button', { name: 'Add tag' }).click();
	const picker = page.getByRole('dialog', { name: /^Organise/ });
	const find = picker.getByRole('combobox', { name: 'Find or create a tag' });
	await expect(find).toBeFocused();
	await expect(picker.getByRole('option', { name: /T15 project not shown/ })).toHaveCount(0);
	await find.fill('T15 Fresh Tag');
	await expect(picker.getByRole('option', { name: /Create tag “t15 fresh tag”/ })).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(picker.getByRole('option', { name: /t15 fresh tag/ })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect.poll(async () => (await linkById(page, link.id)).tagIds.length).toBe(1);
});

test("a tag's page drops a link the moment its tag is removed in the details, with no reload", async ({
	page
}) => {
	const [a, b] = await save(page, [
		'https://t15-tagpage.example.com/a',
		'https://t15-tagpage.example.com/b'
	]);
	const tag = await makeTag(page, 't15 tagpage');
	await tagLink(page, a.id, [tag.id]);
	await tagLink(page, b.id, [tag.id]);
	await ready(page, `/tags/${tag.id}`);
	const ra = row(page, 't15-tagpage.example.com', '/a');
	await expect(ra).toHaveCount(1);
	const details = await openDetails(page, ra);
	await details.getByRole('button', { name: 'Remove tag t15 tagpage' }).click();
	await expect(ra).toHaveCount(0);
	await expect(row(page, 't15-tagpage.example.com', '/b')).toHaveCount(1);
	expect((await linkById(page, a.id)).tagIds).toEqual([]);
});

test("a project's page drops a link the moment it is removed from the project, with no reload", async ({
	page
}) => {
	const [a, b] = await save(page, [
		'https://t15-projpage.example.com/a',
		'https://t15-projpage.example.com/b'
	]);
	const project = await makeProject(page, 'T15 projpage');
	await tagLink(page, a.id, [], [project.id]);
	await tagLink(page, b.id, [], [project.id]);
	await ready(page, `/projects/${project.id}`);
	const ra = row(page, 't15-projpage.example.com', '/a');
	await expect(ra).toHaveCount(1);
	const details = await openDetails(page, ra);
	await details.getByRole('button', { name: 'Remove from T15 projpage' }).click();
	await expect(ra).toHaveCount(0);
	await expect(row(page, 't15-projpage.example.com', '/b')).toHaveCount(1);
});

test('Unsorted drops a link once it has a project or a tag, and the organiser stays usable meanwhile', async ({
	page
}) => {
	const [a, b] = await save(page, [
		'https://t15-unsorted.example.com/a',
		'https://t15-unsorted.example.com/b'
	]);
	const project = await makeProject(page, 'T15 unsorted project');
	await ready(page, '/unsorted');
	const ra = row(page, 't15-unsorted.example.com', '/a');
	const rb = row(page, 't15-unsorted.example.com', '/b');
	await expect(ra).toHaveCount(1);
	await expect(rb).toHaveCount(1);

	// A project from the details: the row leaves at once; the picker still shows the link and can undo it.
	const details = await openDetails(page, ra);
	await details.getByRole('button', { name: 'Add to project' }).click();
	const picker = page.getByRole('dialog', { name: /^Organise/ });
	await picker.getByRole('option', { name: /T15 unsorted project/ }).click();
	await expect(ra).toHaveCount(0);
	await expect(picker.getByRole('option', { name: /T15 unsorted project/ })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await page.keyboard.press('Escape');
	await expect(rb).toHaveCount(1);
	expect((await linkById(page, a.id)).projectIds).toEqual([project.id]);

	// A tag from the details, too.
	const detailsB = await openDetails(page, rb);
	await detailsB.getByRole('button', { name: 'Add tag' }).click();
	await page.getByRole('combobox', { name: 'Find or create a tag' }).fill('t15 unsorted tag');
	await page.keyboard.press('Enter');
	await expect(rb).toHaveCount(0);
	await page.keyboard.press('Escape');
	expect((await linkById(page, b.id)).tagIds.length).toBe(1);
});

test('Archive drops a link the moment it is restored from its details, with no reload', async ({
	page
}) => {
	const [a] = await save(page, ['https://t15-archive.example.com/a']);
	await page.request.patch(`/api/links/${a.id}`, { data: { archived: true } });
	await ready(page, '/archive');
	const ra = row(page, 't15-archive.example.com');
	await expect(ra).toHaveCount(1);
	const details = await openDetails(page, ra);
	await details.getByRole('button', { name: 'Restore' }).click();
	await expect(ra).toHaveCount(0);
	await expect.poll(async () => (await linkById(page, a.id)).archivedAt).toBeNull();
});

test('the main list drops a link when it is archived or deleted from its details, and an undo adds it back', async ({
	page
}) => {
	const [a, b] = await save(page, [
		'https://t15-main.example.com/a',
		'https://t15-main.example.com/b'
	]);
	await ready(page, '/');
	const ra = row(page, 't15-main.example.com', '/a');
	const rb = row(page, 't15-main.example.com', '/b');
	await expect(ra).toHaveCount(1);

	const details = await openDetails(page, ra);
	await details.getByRole('button', { name: 'Archive' }).click();
	await expect(ra).toHaveCount(0);
	await page
		.getByRole('status')
		.filter({ hasText: 'Archived' })
		.getByRole('button', { name: 'Undo' })
		.click();
	await expect(ra).toHaveCount(1);

	const detailsB = await openDetails(page, rb);
	await detailsB.getByRole('button', { name: 'Delete' }).click();
	await expect(rb).toHaveCount(0);
	await page
		.getByRole('status')
		.filter({ hasText: 'Deleted' })
		.getByRole('button', { name: 'Undo' })
		.click();
	await expect(rb).toHaveCount(1);
	expect((await linkById(page, a.id)).archivedAt).toBeNull();
	expect(b.id).toBeTruthy();
});
