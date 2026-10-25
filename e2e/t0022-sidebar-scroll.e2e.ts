import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

// The sidebar's project list scrolls inside its own area; Settings and Log out stay fixed under it (T-0022, BUG-003).
// Runs on the shared e2e server (one worker, name order); makes the account itself when run alone.
const port = Number(process.env.E2E_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const email = 'person@example.com';
const password = 'correct horse battery staple';
const state = 'data/e2e/t0022-session.json';

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

const COUNT = 300;
const prefix = 'Sidebar scroll folder ';
const made: string[] = [];

async function ready(page: Page, path: string) {
	await page.goto(path);
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();
}

/** The desktop sidebar's measures: its project list, the foot, and whether the sidebar itself scrolls. */
const measures = (page: Page) =>
	page.evaluate(() => {
		const side = document.querySelector('aside.side')!;
		const list = side.querySelector('nav[aria-label="Projects"]')!;
		const foot = side.querySelector('.side-foot')!;
		const settings = foot.querySelector('a[href="/settings"]')!.getBoundingClientRect();
		const logout = foot.querySelector('button')!.getBoundingClientRect();
		return {
			sideScrolls: side.scrollHeight > side.clientHeight,
			listScrolls: list.scrollHeight > list.clientHeight,
			listScrollTop: list.scrollTop,
			settingsTop: Math.round(settings.top),
			settingsBottom: Math.round(settings.bottom),
			logoutBottom: Math.round(logout.bottom),
			viewport: window.innerHeight
		};
	});

test.describe('a long project list', () => {
	test.beforeAll(async ({ browser }) => {
		const context = await browser.newContext({ baseURL: origin, storageState: state });
		for (let i = 0; i < COUNT; i++) {
			const res = await context.request.post('/api/projects', {
				data: {
					name: `${prefix}${String(i).padStart(3, '0')} imported from Firefox`,
					color: 'teal'
				}
			});
			expect(res.ok()).toBe(true);
			made.push((await res.json()).project.id);
		}
		await context.close();
	});
	test.afterAll(async ({ browser }) => {
		// Later files on the same server see the sidebar they expect.
		const context = await browser.newContext({ baseURL: origin, storageState: state });
		for (const id of made) await context.request.delete(`/api/projects/${id}`);
		await context.close();
	});

	for (const [width, height] of [
		[1440, 900],
		[1280, 720]
	]) {
		test(`at ${width}x${height} the list scrolls inside the sidebar and Settings and Log out stay in view`, async ({
			page
		}) => {
			await page.setViewportSize({ width, height });
			await ready(page, '/');
			const before = await measures(page);
			expect(before.listScrolls).toBe(true);
			expect(before.sideScrolls).toBe(false);
			expect(before.settingsTop).toBeGreaterThan(0);
			expect(before.logoutBottom).toBeLessThanOrEqual(height);
			expect(before.logoutBottom).toBeGreaterThan(height - 24);

			// Scrolling the list to its end moves nothing below it
			await page.locator('aside.side nav[aria-label="Projects"]').evaluate((el) => {
				el.scrollTop = el.scrollHeight;
			});
			const after = await measures(page);
			expect(after.listScrollTop).toBeGreaterThan(0);
			expect(after.settingsTop).toBe(before.settingsTop);
			expect(after.logoutBottom).toBe(before.logoutBottom);
			await expect(
				page.locator('aside.side').getByRole('link', { name: 'New project' })
			).toBeInViewport();
			await expect(
				page.locator('aside.side').getByRole('link', { name: 'Settings' })
			).toBeInViewport();
			await expect(
				page.locator('aside.side').getByRole('button', { name: 'Log out' })
			).toBeInViewport();
		});
	}

	test('the keyboard reaches the projects in order and the list scrolls to the focused one', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1280, height: 720 });
		await ready(page, '/');
		const items = page.locator('aside.side nav[aria-label="Projects"] a.nav-item');
		const names = (await items.allTextContents())
			.map((t) => t.trim())
			.filter((t) => t !== 'New project');
		// Every project is there, in the order they were made
		const mine = names.filter((n) => n.startsWith(prefix));
		expect(mine).toEqual(
			Array.from(
				{ length: COUNT },
				(_, i) => `${prefix}${String(i).padStart(3, '0')} imported from Firefox`
			)
		);

		await items.first().focus();
		const focusedName = () =>
			page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
		for (let i = 1; i <= 40; i++) {
			await page.keyboard.press('Tab');
			expect(await focusedName()).toBe(names[i]);
		}
		const inside = await page.evaluate(() => {
			const list = document.querySelector('aside.side nav[aria-label="Projects"]')!;
			const box = list.getBoundingClientRect();
			const f = document.activeElement!.getBoundingClientRect();
			return {
				scrolled: list.scrollTop > 0,
				visible: f.top >= box.top - 1 && f.bottom <= box.bottom + 1
			};
		});
		expect(inside).toEqual({ scrolled: true, visible: true });
	});
});

test('with a few projects the sidebar is as it was: it does not scroll, the foot at the bottom', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await ready(page, '/');
	const m = await measures(page);
	expect(m.sideScrolls).toBe(false);
	expect(m.logoutBottom).toBeGreaterThan(900 - 24);
	await page.screenshot({ path: test.info().outputPath('sidebar-few-1440.png') });
});
