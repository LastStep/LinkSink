import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

// A link pasted or added on a tag's or project's page joins it, so its row stays (T-0017). Runs after the other files
// on the same server (one worker, name order); makes the account itself when run alone.
const port = Number(process.env.E2E_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const email = 'person@example.com';
const password = 'correct horse battery staple';
const state = 'data/e2e/t0017-session.json';

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

type Link = { id: string; url: string; tagIds: string[]; projectIds: string[] };

const makeTag = async (page: Page, name: string) =>
	(await (await page.request.post('/api/tags', { data: { name } })).json()).tag as { id: string };
const makeProject = async (page: Page, name: string) =>
	(await (await page.request.post('/api/projects', { data: { name, color: 'teal' } })).json())
		.project as { id: string };
const saveOne = async (page: Page, url: string, extra: object = {}): Promise<Link> => {
	const res = await page.request.post('/api/links', { data: { url, via: 'paste', ...extra } });
	expect(res.ok()).toBe(true);
	return (await res.json()).link;
};
const allLinks = async (page: Page) =>
	((await (await page.request.get('/api/links')).json()) as { links: Link[] }).links;
const row = (page: Page, host: string) =>
	page.locator('li.row', { has: page.locator(`a[href^="https://${host}"]`) });

async function ready(page: Page, path: string) {
	await page.goto(path);
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();
}

async function add(page: Page, url: string) {
	await page.getByLabel(/link/i).first().fill(url);
	await page.keyboard.press('Enter');
}

test("a link added on a tag's page joins the tag and its row stays", async ({ page }) => {
	const tag = await makeTag(page, 't17 tagpage');
	await ready(page, `/tags/${tag.id}`);
	await add(page, 'https://t17-tagpage.example.com/a');
	await expect(row(page, 't17-tagpage.example.com')).toHaveCount(1);
	// Still there after the server has answered and after a reload.
	await page.waitForTimeout(500);
	await expect(row(page, 't17-tagpage.example.com')).toHaveCount(1);
	const saved = (await allLinks(page)).find((l) => l.url.includes('t17-tagpage.example.com'))!;
	expect(saved.tagIds).toEqual([tag.id]);
	await ready(page, `/tags/${tag.id}`);
	await expect(row(page, 't17-tagpage.example.com')).toHaveCount(1);
});

test("a link added on a project's page joins the project and its row stays", async ({ page }) => {
	const project = await makeProject(page, 'T17 projpage');
	await ready(page, `/projects/${project.id}`);
	await add(page, 'https://t17-projpage.example.com/a');
	await expect(row(page, 't17-projpage.example.com')).toHaveCount(1);
	await page.waitForTimeout(500);
	await expect(row(page, 't17-projpage.example.com')).toHaveCount(1);
	const saved = (await allLinks(page)).find((l) => l.url.includes('t17-projpage.example.com'))!;
	expect(saved.projectIds).toEqual([project.id]);
});

test("pasting an address already saved on a tag's page adds the tag to it and shows the notice", async ({
	page
}) => {
	const existing = await saveOne(page, 'https://t17-dup.example.com/a');
	expect(existing.tagIds).toEqual([]);
	const tag = await makeTag(page, 't17 dup');
	await ready(page, `/tags/${tag.id}`);
	await expect(row(page, 't17-dup.example.com')).toHaveCount(0);
	await add(page, 'https://t17-dup.example.com/a');
	await expect(page.getByText('Already saved.')).toBeVisible();
	await expect(row(page, 't17-dup.example.com')).toHaveCount(1);
	const after = (await allLinks(page)).filter((l) => l.url.includes('t17-dup.example.com'));
	expect(after).toHaveLength(1);
	expect(after[0].id).toBe(existing.id);
	expect(after[0].tagIds).toEqual([tag.id]);
});

test("a pasted link on a project's page can be deleted and the undo brings it back into the project; the main list adds no tag or project", async ({
	page
}) => {
	const project = await makeProject(page, 'T17 undo');
	await ready(page, `/projects/${project.id}`);
	await add(page, 'https://t17-undo.example.com/a');
	const r = row(page, 't17-undo.example.com');
	await expect(r).toHaveCount(1);
	await page.waitForTimeout(500);
	await r.getByRole('button', { name: /^Delete / }).click();
	await expect(r).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(r).toHaveCount(1);
	const back = (await allLinks(page)).find((l) => l.url.includes('t17-undo.example.com'))!;
	expect(back.projectIds).toEqual([project.id]);

	await ready(page, '/');
	await add(page, 'https://t17-main.example.com/a');
	await expect(row(page, 't17-main.example.com')).toHaveCount(1);
	await page.waitForTimeout(500);
	const saved = (await allLinks(page)).find((l) => l.url.includes('t17-main.example.com'))!;
	expect(saved.tagIds).toEqual([]);
	expect(saved.projectIds).toEqual([]);
});
