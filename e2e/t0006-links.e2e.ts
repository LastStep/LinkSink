import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

// Runs after skeleton.e2e.ts (files run in name order, one worker), on the same fresh server. It makes the account
// itself when run alone.
const email = 'person@example.com';
const password = 'correct horse battery staple';
const origin = 'http://127.0.0.1:4173';

test.describe.configure({ mode: 'serial' });

/**
 * Signs in through Better Auth's endpoint and returns its Bearer token (the context keeps the session cookie). The
 * skeleton's rate-limit test leaves this client limited for up to 10 s: wait the time the server asks, then go on.
 */
async function signIn(request: APIRequestContext): Promise<string> {
	for (let attempt = 0; attempt < 6; attempt++) {
		const res = await request.post('/api/auth/sign-in/email', {
			headers: { Origin: origin },
			data: { email, password }
		});
		if (res.ok()) return res.headers()['set-auth-token'];
		if (res.status() === 429) {
			const wait = Number(res.headers()['x-retry-after'] ?? '5');
			await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
			continue;
		}
		if (res.status() === 401 && attempt === 0 && sentMail().length === 0) {
			// Run alone: make and confirm the account first.
			const up = await request.post('/api/auth/sign-up/email', {
				headers: { Origin: origin },
				data: { email, password, name: email }
			});
			expect(up.ok()).toBe(true);
			const verify = await request.get(linkIn(sentMail().find((m) => m.to === email)!));
			expect(verify.ok()).toBe(true);
			continue;
		}
		throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);
	}
	throw new Error('sign-in still rate-limited');
}

const rows = (page: Page) => page.getByRole('list', { name: 'Links' }).getByRole('listitem');

const noCookies = { cookies: [], origins: [] };
let token = '';
const state = 'data/e2e/t0006-session.json';

// One sign-in for the file (sign-in allows 3 tries per 10 s): its cookie for the pages, its token for the API.
test.beforeAll(async ({ browser }) => {
	const context = await browser.newContext({
		baseURL: origin,
		storageState: noCookies
	});
	token = await signIn(context.request);
	await context.storageState({ path: state });
	await context.close();
});
test.use({ storageState: state });

test('the API works with a Bearer token alone: create, duplicate, read, edit, delete', async ({
	playwright
}) => {
	// A context with no cookies at all, as the iOS Shortcut or a script calls it.
	const api = await playwright.request.newContext({
		baseURL: origin,
		storageState: noCookies,
		extraHTTPHeaders: { authorization: `Bearer ${token}` }
	});
	const noAuth = await playwright.request.newContext({ baseURL: origin, storageState: noCookies });
	expect((await noAuth.get('/api/links')).status()).toBe(401);
	expect(
		(await noAuth.post('/api/links', { data: { url: 'https://example.com/x' } })).status()
	).toBe(401);

	const created = await api.post('/api/links', {
		data: { url: 'https://example.org/bearer?utm_source=x' }
	});
	expect(created.status()).toBe(201);
	const { link } = await created.json();
	expect(link).toMatchObject({
		url: 'https://example.org/bearer',
		title: 'example.org',
		metaState: 'pending',
		savedVia: 'api'
	});

	const again = await api.post('/api/links', { data: { url: 'https://www.example.org/bearer/' } });
	expect(again.status()).toBe(200);
	expect(await again.json()).toMatchObject({ duplicate: true, link: { id: link.id } });

	expect((await (await api.get(`/api/links/${link.id}`)).json()).link.id).toBe(link.id);
	const edited = await api.patch(`/api/links/${link.id}`, { data: { title: 'Named by hand' } });
	expect((await edited.json()).link).toMatchObject({ title: 'Named by hand', userSet: ['title'] });

	// SvelteKit refuses a body-less DELETE with no Origin (its CSRF rule for form-like requests), so a client
	// outside the browser names the JSON content type on every write.
	const json = { 'content-type': 'application/json' };
	expect((await api.delete(`/api/links/${link.id}`, { headers: json })).status()).toBe(200);
	expect((await api.get(`/api/links/${link.id}`)).status()).toBe(404);
	const all = (await (await api.get('/api/links')).json()).links as { id: string }[];
	expect(all.some((l) => l.id === link.id)).toBe(false);
	const back = await api.post(`/api/links/${link.id}/restore`, { headers: json });
	expect((await back.json()).link).toMatchObject({ id: link.id, deletedAt: null });
	expect((await api.delete(`/api/links/${link.id}`, { headers: json })).status()).toBe(200);

	// A form-encoded cross-site style post is refused even with a valid token.
	const form = await api.post('/api/links', { form: { url: 'https://example.com/form' } });
	expect([403, 415]).toContain(form.status());

	await api.dispose();
	await noAuth.dispose();
});

/** Dispatches a paste of `text` on the page's body and returns the milliseconds until its row is painted. */
function pasteAndTime(page: Page, text: string) {
	return page.evaluate(async (text) => {
		const list = () => document.querySelector('ul[aria-label="Links"]');
		const before = list()?.children.length ?? 0;
		const shown = new Promise<number>((resolve) => {
			const check = () => (list()?.children.length ?? 0) > before;
			const observer = new MutationObserver(() => {
				if (!check()) return;
				observer.disconnect();
				// Measured to the next frame, when the row is on screen.
				requestAnimationFrame(() => resolve(performance.now()));
			});
			observer.observe(document.body, { childList: true, subtree: true });
		});
		const data = new DataTransfer();
		data.setData('text/plain', text);
		const start = performance.now();
		document.body.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
		);
		return (await shown) - start;
	}, text);
}

test('a link pasted anywhere on the page shows as a row in under 100 ms, before the server answers', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Links' })).toBeVisible();
	await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');

	// Hold the server's answer until the row has been seen, so the row cannot have come from it.
	let release!: () => void;
	const held = new Promise<void>((r) => (release = r));
	let answered = false;
	await page.route('**/api/links', async (route) => {
		if (route.request().method() !== 'POST') return route.continue();
		await held;
		const res = await route.fetch();
		answered = true;
		await route.fulfill({ response: res });
	});

	const ms = await pasteAndTime(
		page,
		'Have a look: https://paste.example.com/article?utm_source=x'
	);
	console.log(`paste to row: ${ms.toFixed(1)} ms`);
	expect(ms).toBeLessThan(100);
	expect(answered).toBe(false);
	const row = rows(page).filter({ hasText: 'paste.example.com' });
	await expect(row).toHaveAttribute('data-state', 'saving');

	release();
	await expect(row).toHaveAttribute('data-state', 'saved');
	await page.unroute('**/api/links');

	// It is really saved: a fresh load shows it.
	await page.reload();
	await expect(rows(page).filter({ hasText: 'paste.example.com' })).toHaveCount(1);
});

test('pasting inside the search field stays a plain paste', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');
	const count = await rows(page).count();
	const search = page.getByRole('searchbox', { name: 'Search' });
	await search.focus();
	await page.evaluate(() => {
		const data = new DataTransfer();
		data.setData('text/plain', 'https://example.com/not-saved');
		document
			.querySelector('input[type=search]')!
			.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
	});
	await page.waitForTimeout(300);
	await expect(rows(page)).toHaveCount(count);
});

test('the same address pasted again with utm and www variants stays one row', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');
	const address = 'https://dup.example.com/story';
	const variants = [
		address,
		'https://www.dup.example.com/story/?utm_source=twitter&utm_medium=social',
		'https://dup.example.com/story?utm_campaign=x#comments'
	];
	for (const [i, text] of variants.entries()) {
		await pasteAndTime(page, text);
		if (i > 0) await expect(page.getByRole('status')).toContainText('Already saved');
		await expect(rows(page).filter({ hasText: 'dup.example.com' })).toHaveCount(1);
		await expect(rows(page).filter({ hasText: 'dup.example.com' })).toHaveAttribute(
			'data-state',
			'saved'
		);
	}
	await page.reload();
	await expect(rows(page).filter({ hasText: 'dup.example.com' })).toHaveCount(1);
});

test('delete shows a 5-second undo that brings the link back', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');
	await pasteAndTime(page, 'https://undo.example.com/keep-me');
	const row = rows(page).filter({ hasText: 'undo.example.com' });
	await expect(row).toHaveAttribute('data-state', 'saved');

	await row.getByRole('button', { name: /^Delete/ }).click();
	await expect(row).toHaveCount(0);
	const toast = page.getByRole('status').filter({ hasText: 'Deleted' });
	await expect(toast).toBeVisible();
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(row).toHaveCount(1);
	await expect(toast).toHaveCount(0);
	await page.reload();
	await expect(rows(page).filter({ hasText: 'undo.example.com' })).toHaveCount(1);

	// Without undo, the toast leaves after 5 seconds and the link stays deleted.
	await rows(page)
		.filter({ hasText: 'undo.example.com' })
		.getByRole('button', { name: /^Delete/ })
		.click();
	const shownAt = Date.now();
	await expect(toast).toBeVisible();
	await expect(toast).toHaveCount(0, { timeout: 7000 });
	const shownFor = Date.now() - shownAt;
	expect(shownFor).toBeGreaterThanOrEqual(4500);
	await page.reload();
	await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');
	await expect(rows(page).filter({ hasText: 'undo.example.com' })).toHaveCount(0);
});
