import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

// Details fetched after an import show up on the open page (T-0023, BUG-004): a bookmarks file of fixture-site links
// is imported from Settings; the open list fills in each title, icon and preview as the server fetches them, with no
// reload, under a line that counts the links still waiting. Runs on the shared e2e server after the files before it
// (name order); every link it makes is on the fixture site under /article.html?n=… and is deleted afterwards.
const port = Number(process.env.E2E_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const fixture = `http://127.0.0.1:${Number(process.env.E2E_FIXTURE_PORT || port + 1)}`;
const email = 'person@example.com';
const password = 'correct horse battery staple';
const state = 'data/e2e/t0023-session.json';
const COUNT = 8;

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

const bookmarks = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<DL><p>
${Array.from({ length: COUNT }, (_, i) => `<DT><A HREF="${fixture}/article.html?n=${i}" ADD_DATE="${1_700_000_000 + i}">Imported ${i}</A>`).join('\n')}
</DL><p>
`;

async function clearMine(page: Page) {
	const res = await page.request.get('/api/export.json');
	const ids = ((await res.json()) as { links: { id: string; url: string }[] }).links
		.filter((l) => l.url.startsWith(`${fixture}/article.html?n=`))
		.map((l) => l.id);
	if (ids.length) {
		expect(
			(await page.request.post('/api/links/bulk', { data: { ids, deleted: true } })).ok()
		).toBe(true);
	}
}

test.afterAll(async ({ browser }) => {
	const context = await browser.newContext({ baseURL: origin, storageState: state });
	await clearMine(await context.newPage());
	await context.close();
});

test('after an import, the open list fills in titles and previews with no reload, under a falling count', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await clearMine(page);
	await page.goto('/settings');
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();
	await page.getByLabel('Bookmarks file to import').setInputFiles({
		name: 'fixture-bookmarks.html',
		mimeType: 'text/html',
		buffer: Buffer.from(bookmarks)
	});
	let reloads = 0;
	page.on('load', () => reloads++);
	await page.getByRole('button', { name: /^Import [\d,]+ links?$/ }).click();
	await expect(page.getByTestId('import-summary')).toContainText(`${COUNT} links added`);

	// to the list by the sidebar, not by a reload: the open page is the one that must fill in
	await page.getByRole('link', { name: 'Links', exact: true }).first().click();
	const line = page.getByTestId('fetching');
	const rows = page.locator('li.row', {
		has: page.locator(`a[href^="${fixture}/article.html?n="]`)
	});
	await expect(rows).toHaveCount(COUNT);
	await expect(line).toBeVisible();
	await expect(line).toContainText(/Fetching details: \d+ left/);
	await page.screenshot({ path: testInfo.outputPath('list-fetching-1440-light.png') });

	// the count only goes down, and every number it shows is one of the left-over counts
	const seen: number[] = [];
	await expect
		.poll(
			async () => {
				const text = await line.textContent({ timeout: 1_000 }).catch(() => null);
				const n = text ? Number(/(\d+)/.exec(text)?.[1]) : 0;
				if (seen.at(-1) !== n) seen.push(n);
				return n;
			},
			{ timeout: 60_000, intervals: [250] }
		)
		.toBe(0);
	for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThan(seen[i - 1]);
	expect(seen[0]).toBeGreaterThan(0);

	// the line is gone, and each imported link has its page's title and icon, still on the same page load
	await expect(line).toHaveCount(0);
	await expect(rows.locator('a.t')).toHaveText(Array(COUNT).fill('Fixture article for LinkSink'));
	await expect(rows.locator('img.icon')).toHaveCount(COUNT);
	for (const row of await rows.all()) await expect(row).toHaveAttribute('data-meta', 'ok');
	expect(reloads).toBe(0);
	await page.screenshot({ path: testInfo.outputPath('list-fetched-1440-light.png') });
});
