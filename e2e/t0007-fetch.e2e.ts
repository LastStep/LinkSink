import { expect, test } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

// The page details fill in after a paste, from the local fixture site the e2e server starts (scripts/e2e-fixtures.js),
// never the internet. Runs after the other files on the same server; makes the account itself when run alone.
const port = Number(process.env.E2E_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const fixture = `http://127.0.0.1:${Number(process.env.E2E_FIXTURE_PORT || port + 1)}`;
const email = 'person@example.com';
const password = 'correct horse battery staple';

test('a pasted link shows its host, then the page’s title, icon and preview fill in without a reload', async ({
	page
}) => {
	for (let attempt = 0; attempt < 6; attempt++) {
		const res = await page.request.post('/api/auth/sign-in/email', {
			headers: { Origin: origin },
			data: { email, password }
		});
		if (res.ok()) break;
		if (res.status() === 429) {
			await page.waitForTimeout((Number(res.headers()['x-retry-after'] ?? '5') + 1) * 1000);
		} else if (res.status() === 401 && sentMail().length === 0) {
			await page.request.post('/api/auth/sign-up/email', {
				headers: { Origin: origin },
				data: { email, password, name: email }
			});
			await page.request.get(linkIn(sentMail().find((m) => m.to === email)!));
		} else throw new Error(`sign-in failed: ${res.status()}`);
	}
	await page.goto('/');
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();

	const url = `${fixture}/article.html`;
	let reloads = 0;
	page.on('load', () => reloads++);
	await page.evaluate((text) => {
		const data = new DataTransfer();
		data.setData('text/plain', text);
		document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
	}, url);

	const row = page.locator('li.row', { has: page.locator(`a[href="${url}"]`) });
	// first the host, before the page is read
	await expect(row.locator('a.t')).toHaveText('127.0.0.1');
	// then the fixture page's own title, its icon and its preview, as the store polls
	await expect(row.locator('a.t')).toHaveText('Fixture article for LinkSink', { timeout: 10_000 });
	await expect(row).toHaveAttribute('data-meta', 'ok');
	const icon = row.locator('img.icon');
	const preview = row.locator('img.preview');
	await expect(icon).toHaveAttribute('src', /^\/media\/[0-9a-f]{64}\.webp$/);
	await expect(preview).toHaveAttribute('src', /^\/media\/[0-9a-f]{64}-320\.webp$/);
	expect(await icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(64);
	expect(await preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(
		320
	);
	expect(reloads).toBe(0);

	// the cached image is served as WebP with nosniff, and only to the signed-in person
	const src = (await preview.getAttribute('src'))!;
	const served = await page.request.get(src);
	expect(served.headers()['content-type']).toBe('image/webp');
	expect(served.headers()['x-content-type-options']).toBe('nosniff');
	const anonymous = await page.context().browser()!.newContext({ baseURL: origin });
	expect((await anonymous.request.get(src)).status()).toBe(401);
	await anonymous.close();
});
