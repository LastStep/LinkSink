import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

// Export and import (T-0012): Settings' Import and Export sections, a bookmarks file imported, exported, cleared
// and imported back, refused files, and markup in titles and notes shown as text. Runs on the shared e2e server
// after the files before it (name order); every link it makes is under *.t0012.example and is deleted afterwards,
// with its tags and projects, so the files after it see the account as it was.
const port = Number(process.env.E2E_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const email = 'person@example.com';
const password = 'correct horse battery staple';
const state = 'data/e2e/t0012-session.json';

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

const now = Math.floor(Date.now() / 1000);
const XSS_TITLE = '<img src=x onerror="window.__xss=1">Markup title';
const XSS_NOTE = 'Note with <script>window.__xss=2</script> and <b>bold</b>';
const escape = (s: string) =>
	s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');

/** A browser-style bookmarks file: a folder with a nested one, tags, a note, a duplicate, a non-web link. */
const bookmarks = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${now - 900}" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://bar.t0012.example/" ADD_DATE="${now - 800}">On the bar</A>
        <DT><H3 ADD_DATE="${now - 700}">T0012 Work</H3>
        <DL><p>
            <DT><A HREF="https://work.t0012.example/a" ADD_DATE="${now - 600}" TAGS="t0012-ai,t0012-recs">Work A</A>
            <DD>A plain note
            <DT><H3 ADD_DATE="${now - 500}">Deep</H3>
            <DL><p>
                <DT><A HREF="https://deep.t0012.example/b" ADD_DATE="${now - 400}">Deep B</A>
            </DL><p>
        </DL><p>
    </DL><p>
    <DT><A HREF="https://xss.t0012.example/" ADD_DATE="${now - 300}" TAGS="t0012-ai">${escape(XSS_TITLE)}</A>
    <DD>${escape(XSS_NOTE)}
    <DT><A HREF="https://www.work.t0012.example/a/?utm_source=x" ADD_DATE="${now - 200}">Work A again</A>
    <DT><A HREF="javascript:alert(1)" ADD_DATE="${now - 100}">Not a link</A>
</DL><p>
`;

type ExportLink = {
	id: string;
	url: string;
	title: string;
	notes: string | null;
	createdAt: number;
	savedVia: string;
	tags: string[];
	projects: string[];
};
type Export = {
	format: string;
	links: ExportLink[];
	tags: { id: string; name: string }[];
	projects: { id: string; name: string }[];
};

async function exported(page: Page): Promise<Export> {
	const res = await page.request.get('/api/export.json');
	expect(res.ok()).toBe(true);
	return (await res.json()) as Export;
}
const mine = (e: Export) =>
	e.links
		.filter((l) => new URL(l.url).hostname.endsWith('t0012.example'))
		.map((l) => ({
			url: l.url,
			title: l.title,
			notes: l.notes,
			tags: [...l.tags].sort(),
			projects: [...l.projects].sort(),
			addDate: Math.floor(l.createdAt / 1000)
		}))
		.sort((a, b) => a.url.localeCompare(b.url));

/** Deletes every link, tag and project this file made. */
async function clearMine(page: Page) {
	const e = await exported(page);
	const ids = e.links
		.filter((l) => new URL(l.url).hostname.endsWith('t0012.example'))
		.map((l) => l.id);
	if (ids.length) {
		const res = await page.request.post('/api/links/bulk', { data: { ids, deleted: true } });
		expect(res.ok()).toBe(true);
	}
	for (const t of e.tags.filter((t) => t.name.startsWith('t0012-'))) {
		expect(
			(
				await page.request.delete(`/api/tags/${t.id}`, {
					headers: { 'content-type': 'application/json' }
				})
			).ok()
		).toBe(true);
	}
	for (const p of e.projects.filter((p) => p.name.startsWith('T0012'))) {
		expect(
			(
				await page.request.delete(`/api/projects/${p.id}`, {
					headers: { 'content-type': 'application/json' }
				})
			).ok()
		).toBe(true);
	}
}

async function openSettings(page: Page) {
	await page.goto('/settings');
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();
}

async function importFile(
	page: Page,
	name: string,
	content: string | Buffer,
	mimeType = 'text/html'
) {
	await page.getByLabel('Bookmarks file to import').setInputFiles({
		name,
		mimeType,
		buffer: typeof content === 'string' ? Buffer.from(content) : content
	});
}

test.afterAll(async ({ browser }) => {
	const context = await browser.newContext({ baseURL: origin, storageState: state });
	const page = await context.newPage();
	await clearMine(page);
	await context.close();
});

test('a bookmarks file imported from Settings, exported, cleared and imported back comes back the same', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await clearMine(page);
	await openSettings(page);
	await expect(page.getByRole('heading', { name: 'Export' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Import' })).toBeVisible();

	await importFile(page, 'bookmarks.html', bookmarks);
	await expect(page.getByTestId('import-chosen')).toContainText('bookmarks.html');
	await expect(page.getByTestId('import-chosen')).toContainText('Bookmarks file (HTML)');
	await page.getByRole('button', { name: 'Import', exact: true }).click();
	const summary = page.getByTestId('import-summary');
	await expect(summary).toContainText('4 links added');
	await expect(summary).toContainText('1 duplicate skipped');
	await expect(summary).toContainText('1 line could not be read');
	await expect(summary).toContainText('Line 22: Not a web address (javascript:alert(1)).');

	const first = mine(await exported(page));
	expect(first).toEqual([
		{
			url: 'https://bar.t0012.example/',
			title: 'On the bar',
			notes: null,
			tags: [],
			projects: [],
			addDate: now - 800
		},
		{
			url: 'https://deep.t0012.example/b',
			title: 'Deep B',
			notes: null,
			tags: [],
			projects: ['T0012 Work / Deep'],
			addDate: now - 400
		},
		{
			url: 'https://work.t0012.example/a',
			title: 'Work A',
			notes: 'A plain note',
			tags: ['t0012-ai', 't0012-recs'],
			projects: ['T0012 Work'],
			addDate: now - 600
		},
		{
			url: 'https://xss.t0012.example/',
			title: XSS_TITLE,
			notes: XSS_NOTE,
			tags: ['t0012-ai'],
			projects: [],
			addDate: now - 300
		}
	]);
	expect(
		(await exported(page)).links
			.filter((l) => l.url.includes('t0012'))
			.every((l) => l.savedVia === 'import')
	).toBe(true);

	// Export downloads a bookmarks file.
	const download = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Download bookmarks (HTML)' }).click();
	const file = await download;
	expect(file.suggestedFilename()).toMatch(/^linksink-bookmarks-\d{4}-\d\d-\d\d\.html$/);
	const html = readFileSync((await file.path())!, 'utf8');
	expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);

	// Chromium's own HTML parser reads it as the bookmark tree browsers import: folders as <H3> before a <DL>,
	// links as <DT><A>, markup only as text.
	const reader = await page.context().newPage();
	await reader.setContent(html);
	const tree = await reader.evaluate(() => {
		const out: { folder: string | null; href: string; text: string; tags: string | null }[] = [];
		for (const a of document.querySelectorAll('dt > a')) {
			// <DT><H3>name</H3><DL>…</DL>: the list sits in the folder's <DT>, after its <H3>.
			const h3 = a.closest('dl')?.parentElement?.querySelector(':scope > h3') ?? null;
			out.push({
				folder: h3?.textContent ?? null,
				href: a.getAttribute('href')!,
				text: a.textContent!,
				tags: a.getAttribute('tags')
			});
		}
		return {
			links: out,
			images: document.querySelectorAll('img').length,
			scripts: document.querySelectorAll('body script').length
		};
	});
	await reader.close();
	expect(tree.images).toBe(0);
	expect(tree.scripts).toBe(0);
	const t0012 = tree.links.filter((l) => l.href.includes('t0012.example'));
	expect(t0012.map((l) => [l.folder, l.href, l.text, l.tags]).sort()).toEqual(
		[
			[null, 'https://bar.t0012.example/', 'On the bar', null],
			[null, 'https://xss.t0012.example/', XSS_TITLE, 't0012-ai'],
			['T0012 Work', 'https://work.t0012.example/a', 'Work A', 't0012-ai,t0012-recs'],
			['T0012 Work / Deep', 'https://deep.t0012.example/b', 'Deep B', null]
		].sort()
	);

	// Cleared, then the exported file imported back: the same links, tags, projects, notes and dates.
	await clearMine(page);
	expect(mine(await exported(page))).toEqual([]);
	await openSettings(page);
	await importFile(page, file.suggestedFilename(), html);
	await page.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(page.getByTestId('import-summary')).toContainText('4 links added');
	expect(mine(await exported(page))).toEqual(first);
	await page.screenshot({
		path: testInfo.outputPath('settings-import-1440-light.png'),
		fullPage: true
	});

	// The JSON download.
	const json = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Download everything (JSON)' }).click();
	const jsonFile = await json;
	expect(jsonFile.suggestedFilename()).toMatch(/^linksink-export-\d{4}-\d\d-\d\d\.json$/);
	expect(JSON.parse(readFileSync((await jsonFile.path())!, 'utf8')).format).toBe(
		'linksink.export/1'
	);
});

test('markup in an imported title and note shows as text, never as markup', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/');
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();
	await expect(page.getByText(XSS_TITLE, { exact: true })).toBeVisible();
	// Opened from the keyboard: the title itself is a link to the site.
	const row = page
		.locator('li', { has: page.locator('a[href^="https://xss.t0012.example"]') })
		.last();
	await row.focus();
	await page.keyboard.press('Enter');
	const details = page.getByRole('complementary', { name: 'Link details' });
	await expect(details).toBeVisible();
	const shown = await details.evaluate((el) =>
		[
			el.textContent ?? '',
			...[...el.querySelectorAll('input, textarea')].map((i) => (i as HTMLInputElement).value)
		].join('\n')
	);
	expect(shown).toContain(XSS_NOTE);
	expect(await page.locator('img[src="x"]').count()).toBe(0);
	expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
});

test('a file that is not bookmarks, or over 20 MB, is refused with a message and nothing is written', async ({
	page
}) => {
	const before = (await exported(page)).links.length;
	await openSettings(page);
	await importFile(
		page,
		'photo.png',
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		'image/png'
	);
	await expect(page.getByRole('alert')).toHaveText(
		'That is not a bookmarks file. Choose an HTML bookmarks export or a Pocket CSV.'
	);
	await expect(page.getByRole('button', { name: 'Import', exact: true })).toHaveCount(0);

	await importFile(
		page,
		'page.html',
		'<!doctype html><title>Hi</title><a href="https://x.t0012.example">x</a>'
	);
	await expect(page.getByRole('alert')).toContainText('not a bookmarks file');

	// The server refuses on its own, whatever the page lets through.
	const page2 = await page.request.post('/api/import', {
		headers: { 'content-type': 'application/octet-stream' },
		data: Buffer.from('<!doctype html><a href="https://y.t0012.example">y</a>')
	});
	expect(page2.status()).toBe(400);
	expect((await page2.json()).error).toMatch(/not a bookmarks file/);
	const big = await page.request.post('/api/import', {
		headers: { 'content-type': 'application/octet-stream' },
		data: Buffer.alloc(20 * 1024 * 1024 + 100, 0x20)
	});
	expect(big.status()).toBe(413);
	expect((await big.json()).error).toMatch(/over 20 MB/);
	const form = await page.request.post('/api/import', {
		headers: { 'content-type': 'text/plain' },
		data: bookmarks
	});
	// A body a cross-site form could send: SvelteKit's CSRF check (403) or the import's own (415) refuses it.
	expect([403, 415]).toContain(form.status());
	// Every other route keeps the 512 KB body limit.
	const other = await page.request.post('/api/links', {
		headers: { 'content-type': 'application/json' },
		data: JSON.stringify({ url: 'https://z.t0012.example', title: 'x'.repeat(600 * 1024) })
	});
	expect(other.status()).toBe(413);
	expect((await exported(page)).links.length).toBe(before);
});

test('Settings at 390 and 1440, light and dark, with an import summary', async ({
	page
}, testInfo) => {
	const pocket =
		'title,url,time_added,tags,status\n' +
		`Pocket one,https://pocket.t0012.example/1,${now},t0012-pocket,archive\n` +
		`Pocket two,https://pocket.t0012.example/2,${now},,unread\n` +
		',,,,\n';
	for (const scheme of ['light', 'dark'] as const) {
		for (const width of [390, 1440]) {
			await page.emulateMedia({ colorScheme: scheme });
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
			await openSettings(page);
			await importFile(page, 'pocket.csv', pocket, 'text/csv');
			await expect(page.getByTestId('import-chosen')).toContainText('Pocket export (CSV)');
			await page.getByRole('button', { name: 'Import', exact: true }).click();
			await expect(page.getByTestId('import-summary')).toContainText('added');
			await expect(page.getByTestId('import-summary')).toContainText(
				'Line 4: A row with no address.'
			);
			// Nothing runs off the side of a phone.
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
			).toBe(true);
			await page.getByRole('heading', { name: 'Export' }).scrollIntoViewIfNeeded();
			await page.screenshot({
				path: testInfo.outputPath(`settings-${width}-${scheme}.png`),
				fullPage: true
			});
		}
	}
	const done = (await exported(page)).links.find((l) => l.url === 'https://pocket.t0012.example/1');
	expect(done).toMatchObject({ tags: ['t0012-pocket'] });
	expect((done as unknown as { status: string }).status).toBe('done');
});
