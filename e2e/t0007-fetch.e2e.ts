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
	// open its details now, before the page is read: the preview fills in there as the store polls
	await expect(row).toHaveAttribute('data-state', 'saved');
	await row.focus();
	await page.keyboard.press('Enter');
	const details = page.getByRole('complementary', { name: 'Link details' });
	await expect(details).toBeVisible();
	// then the fixture page's own title, its icon and its preview, as the store polls
	await expect(row.locator('a.t')).toHaveText('Fixture article for LinkSink', { timeout: 10_000 });
	await expect(row).toHaveAttribute('data-meta', 'ok');
	const icon = row.locator('img.icon');
	await expect(icon).toHaveAttribute('src', /^\/media\/[0-9a-f]{64}\.webp$/);
	expect(await icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(64);
	// the preview shows in the link's details (the ledger row carries no picture, ADR-0003): the 320 or 640 px WebP
	// from /media, loaded, without a reload
	const preview = details.locator('img.preview');
	await expect(preview).toHaveAttribute('src', /^\/media\/[0-9a-f]{64}\.webp$/);
	await expect
		.poll(() => preview.evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0)))
		.toBeGreaterThan(0);
	// with srcset, naturalWidth is scaled by `sizes`, so the file's own width is read from the file the browser chose
	const shown = await preview.evaluate(async (img: HTMLImageElement) => {
		const bitmap = await createImageBitmap(await (await fetch(img.currentSrc)).blob());
		return { src: new URL(img.currentSrc).pathname, width: bitmap.width };
	});
	expect(shown.src).toMatch(/^\/media\/[0-9a-f]{64}(-320)?\.webp$/);
	expect(shown.width).toBe(shown.src.endsWith('-320.webp') ? 320 : 640);
	expect(reloads).toBe(0);

	// the cached image is served as WebP with nosniff, and only to the signed-in person
	const src = shown.src;
	const served = await page.request.get(src);
	expect(served.headers()['content-type']).toBe('image/webp');
	expect(served.headers()['x-content-type-options']).toBe('nosniff');
	const anonymous = await page.context().browser()!.newContext({ baseURL: origin });
	expect((await anonymous.request.get(src)).status()).toBe(401);
	await anonymous.close();
});
