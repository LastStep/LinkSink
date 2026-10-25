import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

// The sort control beside the filters (T-0025): Date saved, Last edited, Last opened, Title, Priority and Status,
// each kept in the address, on a desktop and a phone, and agreeing with the filter panel's own Sort row. Every link it
// makes carries the word t25sort and goes again at the end.
const port = Number(process.env.E2E_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const email = 'person@example.com';
const password = 'correct horse battery staple';
const state = 'data/e2e/t0025-session.json';

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

test.afterAll(async ({ browser }) => {
	const context = await browser.newContext({ baseURL: origin, storageState: state });
	const res = await context.request.get('/api/links?q=t25sort&archived=include&limit=200');
	for (const link of (await res.json()).links as { id: string }[]) {
		await context.request.delete(`/api/links/${link.id}`, {
			headers: { 'content-type': 'application/json' }
		});
	}
	await context.close();
});

const save = async (page: Page, title: string, patch: object = {}) => {
	const res = await page.request.post('/api/links', {
		data: { url: `https://t25sort.example.com/${title}`, title: `T25sort ${title}`, via: 'paste' }
	});
	expect(res.ok()).toBe(true);
	const link = (await res.json()).link as { id: string };
	if (Object.keys(patch).length) {
		expect((await page.request.patch(`/api/links/${link.id}`, { data: patch })).ok()).toBe(true);
	}
	return link.id;
};
const rows = (page: Page) => page.locator('ul.ledger li.row');
const titles = (page: Page) => rows(page).locator('a.t');
const heads = (page: Page) => page.locator('.day-h h2');
const control = (page: Page) => page.getByRole('combobox', { name: 'Order by' });
const names = async (page: Page) =>
	(await titles(page).allInnerTexts()).map((t) => t.replace('T25sort ', ''));

async function ready(page: Page, path: string) {
	await page.goto(path);
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();
}

test('the control beside the filters changes the order at once, keeps it in the address, and agrees with the panel', async ({
	page
}, testInfo) => {
	// saved in this order, so Date saved lists them e, d, c, b, a
	await save(page, 'a none');
	const b = await save(page, 'b done', { status: 'done' });
	await save(page, 'c to read', { status: 'to_read' });
	const d = await save(page, 'd in progress', { status: 'in_progress' });
	await save(page, 'e to read', { status: 'to_read', priority: 3 });
	// opened: d first, then b (the latest)
	for (const id of [d, b]) {
		expect((await page.request.post(`/api/links/${id}/opened`, { data: {} })).ok()).toBe(true);
	}

	await page.setViewportSize({ width: 1440, height: 900 });
	await ready(page, '/?q=t25sort');
	await expect(rows(page)).toHaveCount(5);
	// the control sits right after the Filters button, showing the current sort
	await expect(control(page)).toBeVisible();
	await expect(control(page)).toHaveValue('saved');
	await expect(control(page)).toContainText('Date saved');
	const filters = await page.getByRole('button', { name: /^Filters/ }).boundingBox();
	const sort = await control(page).boundingBox();
	expect(Math.abs(sort!.y - filters!.y)).toBeLessThan(8);
	expect(sort!.x).toBeGreaterThan(filters!.x);
	expect(await names(page)).toEqual([
		'e to read',
		'd in progress',
		'c to read',
		'b done',
		'a none'
	]);
	await page.screenshot({ path: testInfo.outputPath('sort-saved-1440-light.png') });

	// Status: the status list's order (to read, in progress, done), none last; newest first within a status
	let loads = 0;
	page.on('load', () => loads++);
	await control(page).selectOption('status');
	await expect(page).toHaveURL(/sort=status/);
	await expect(titles(page).first()).toHaveText('T25sort e to read');
	expect(await names(page)).toEqual([
		'e to read',
		'c to read',
		'd in progress',
		'b done',
		'a none'
	]);
	await expect(heads(page)).toContainText([/To read/, /In progress/, /Done/, /No status/]);
	await page.screenshot({ path: testInfo.outputPath('sort-status-1440-light.png') });

	// Last opened: newest opened first, then links never opened, newest saved first
	await control(page).selectOption('opened');
	await expect(page).toHaveURL(/sort=opened/);
	await expect(titles(page).first()).toHaveText('T25sort b done');
	expect(await names(page)).toEqual([
		'b done',
		'd in progress',
		'e to read',
		'c to read',
		'a none'
	]);
	await expect(heads(page).last()).toContainText('Never opened');
	expect(loads).toBe(0);

	// the other sorts, each in the address
	await control(page).selectOption('title');
	await expect(page).toHaveURL(/sort=title/);
	expect(await names(page)).toEqual([
		'a none',
		'b done',
		'c to read',
		'd in progress',
		'e to read'
	]);
	await control(page).selectOption('priority');
	await expect(page).toHaveURL(/sort=priority/);
	await expect(titles(page).first()).toHaveText('T25sort e to read');
	await control(page).selectOption('edited');
	await expect(page).toHaveURL(/sort=edited/);
	await control(page).selectOption('saved');
	await expect(page).not.toHaveURL(/sort=/);
	expect(await names(page)).toEqual([
		'e to read',
		'd in progress',
		'c to read',
		'b done',
		'a none'
	]);

	// the address alone brings the order back, and the control shows it
	await ready(page, '/?q=t25sort&sort=status');
	await expect(control(page)).toHaveValue('status');
	expect(await names(page)).toEqual([
		'e to read',
		'c to read',
		'd in progress',
		'b done',
		'a none'
	]);

	// the panel's own Sort row and the "Sorted by" chip agree with the control, both ways
	await page.getByRole('button', { name: /^Filters/ }).click();
	const row = page.getByRole('combobox', { name: 'Sort', exact: true });
	await expect(row).toHaveValue('status');
	await expect(page.getByText('Sorted by')).toBeVisible();
	await row.selectOption('opened');
	await expect(control(page)).toHaveValue('opened');
	await control(page).selectOption('title');
	await expect(row).toHaveValue('title');
	await expect(page).toHaveURL(/sort=title/);

	// the Archive and a tag or project page carry the control too
	await ready(page, '/archive');
	await expect(control(page)).toBeVisible();
	await ready(page, '/unsorted');
	await expect(control(page)).toBeVisible();
});

test('on a phone the control sits beside the filter button, and works, in light and dark', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await ready(page, '/?q=t25sort');
	await expect(rows(page)).toHaveCount(5);
	await expect(control(page)).toBeVisible();
	await expect(control(page)).toContainText('Date saved');
	const filters = await page.getByRole('button', { name: /^Filters/ }).boundingBox();
	const sort = await control(page).boundingBox();
	expect(Math.abs(sort!.y - filters!.y)).toBeLessThan(8);
	expect(sort!.x + sort!.width).toBeLessThanOrEqual(390);
	await page.screenshot({ path: testInfo.outputPath('sort-saved-390-light.png') });
	await control(page).selectOption('status');
	await expect(page).toHaveURL(/sort=status/);
	expect(await names(page)).toEqual([
		'e to read',
		'c to read',
		'd in progress',
		'b done',
		'a none'
	]);
	await page.screenshot({ path: testInfo.outputPath('sort-status-390-light.png') });
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.screenshot({ path: testInfo.outputPath('sort-status-390-dark.png') });
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.screenshot({ path: testInfo.outputPath('sort-status-1440-dark.png') });
});
