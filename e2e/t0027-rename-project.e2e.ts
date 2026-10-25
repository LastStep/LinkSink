import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

// A project is renamed from its own page (T-0027). Runs on the shared e2e server (one worker, name order); makes the
// account itself when run alone.
const port = Number(process.env.E2E_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const email = 'person@example.com';
const password = 'correct horse battery staple';
const state = 'data/e2e/t0027-session.json';

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

const makeProject = async (page: Page, name: string, color = 'teal') =>
	(await (await page.request.post('/api/projects', { data: { name, color } })).json()).project as {
		id: string;
		name: string;
	};

async function ready(page: Page, path: string) {
	await page.goto(path);
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();
}

const sidebarLink = (page: Page, name: string) =>
	page.locator('aside.side nav[aria-label="Projects"]').getByRole('link', { name, exact: true });

test('a project is renamed from its own page: Enter saves, and the sidebar, the title and the lists follow at once', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const project = await makeProject(page, 'Rename me');
	const other = await makeProject(page, 'Rename neighbour', 'blue');
	const link = await page.request.post('/api/links', {
		data: { url: 'https://rename.example.com/a', via: 'paste', projectIds: [project.id] }
	});
	expect(link.ok()).toBe(true);
	await ready(page, `/projects/${project.id}`);
	await expect(page.getByRole('heading', { level: 1, name: 'Rename me' })).toBeVisible();
	await page.screenshot({ path: test.info().outputPath('before-1440-light.png') });

	await page.getByRole('button', { name: 'Rename', exact: true }).click();
	const field = page.getByRole('textbox', { name: 'Project name' });
	await expect(field).toBeFocused();
	await expect(field).toHaveValue('Rename me');
	await page.screenshot({ path: test.info().outputPath('editing-1440-light.png') });
	await field.fill('Renamed in place');
	await field.press('Enter');

	await expect(page.getByRole('heading', { level: 1, name: 'Renamed in place' })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveCount(0);
	await expect(sidebarLink(page, 'Renamed in place')).toBeVisible();
	await expect(sidebarLink(page, 'Rename me')).toHaveCount(0);
	await expect(page).toHaveTitle('Renamed in place · LinkSink');
	await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
	// The row's own project chip follows too
	await expect(page.locator('li.row').first()).toContainText('Renamed in place');
	await page.screenshot({ path: test.info().outputPath('after-1440-light.png') });
	// And the server has it
	const saved = await (await page.request.get('/api/organise')).json();
	expect(saved.projects.find((p: { id: string }) => p.id === project.id).name).toBe(
		'Renamed in place'
	);
	// The Projects page shows the same name
	await ready(page, '/projects');
	await expect(page.getByRole('textbox', { name: 'Name of Renamed in place' })).toBeVisible();
	void other;
});

test('Escape cancels and leaving the field saves; the name is trimmed', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const project = await makeProject(page, 'Escape me');
	await ready(page, `/projects/${project.id}`);

	await page.getByRole('button', { name: 'Rename', exact: true }).click();
	await page.getByRole('textbox', { name: 'Project name' }).fill('Never saved');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('heading', { level: 1, name: 'Escape me' })).toBeVisible();
	await expect(sidebarLink(page, 'Escape me')).toBeVisible();
	await expect(sidebarLink(page, 'Never saved')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Rename', exact: true })).toBeFocused();

	await page.getByRole('button', { name: 'Rename', exact: true }).click();
	await page.getByRole('textbox', { name: 'Project name' }).fill('  Saved on blur  ');
	await page.locator('main.page').click({ position: { x: 5, y: 400 } });
	await expect(page.getByRole('heading', { level: 1, name: 'Saved on blur' })).toBeVisible();
	await expect(sidebarLink(page, 'Saved on blur')).toBeVisible();
});

test("an empty name and another project's name are refused with a message, and nothing changes", async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const project = await makeProject(page, 'Refuse empty');
	await makeProject(page, 'Taken name', 'green');
	await ready(page, `/projects/${project.id}`);

	await page.getByRole('button', { name: 'Rename', exact: true }).click();
	const field = page.getByRole('textbox', { name: 'Project name' });
	await field.fill('   ');
	await field.press('Enter');
	await expect(page.getByRole('alert')).toHaveText('A project needs a name.');
	await expect(field).toBeFocused();
	await expect(sidebarLink(page, 'Refuse empty')).toBeVisible();

	await field.fill('Taken name');
	await field.press('Enter');
	await expect(page.getByRole('alert')).toContainText('There is already a project called');
	await expect(field).toBeVisible();
	await page.screenshot({ path: test.info().outputPath('refused-1440-light.png') });
	await expect(sidebarLink(page, 'Refuse empty')).toBeVisible();

	// Typing again clears the message; Escape leaves the old name in place
	await field.fill('Taken nam');
	await expect(page.getByRole('alert')).toHaveCount(0);
	await field.press('Escape');
	await expect(page.getByRole('heading', { level: 1, name: 'Refuse empty' })).toBeVisible();
	const saved = await (await page.request.get('/api/organise')).json();
	expect(saved.projects.find((p: { id: string }) => p.id === project.id).name).toBe('Refuse empty');
});

test('on a phone the Rename button is in reach and renames the project', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const project = await makeProject(page, 'Phone rename', 'blue');
	await ready(page, `/projects/${project.id}`);
	await page.screenshot({ path: test.info().outputPath('before-390-light.png') });
	await page.getByRole('button', { name: 'Rename', exact: true }).click();
	await page.screenshot({ path: test.info().outputPath('editing-390-light.png') });
	await page.getByRole('textbox', { name: 'Project name' }).fill('Phone renamed');
	await page.keyboard.press('Enter');
	await expect(page.locator('.top-title')).toContainText('Phone renamed');
	await expect(page.getByRole('heading', { level: 1, name: 'Phone renamed' })).toBeAttached();
	await page.screenshot({ path: test.info().outputPath('after-390-light.png') });
});
