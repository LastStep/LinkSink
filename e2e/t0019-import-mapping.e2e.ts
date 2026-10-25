import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

// The import preview and folder mapping (T-0019): choosing a file writes nothing and shows what it holds; each
// folder becomes a new project, an existing one, a tag or nothing; Import writes what the mapping says and Cancel
// throws it away. Runs on the shared e2e server after the files before it (name order); every link it makes is
// under *.t0019.example and is deleted afterwards, with its tags (t0019-…) and projects (T0019 …).
const port = Number(process.env.E2E_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const email = 'person@example.com';
const password = 'correct horse battery staple';
const state = 'data/e2e/t0019-session.json';

test.describe.configure({ mode: 'serial' });

/** The import button, named for what it adds ("Import 5 links"). */
const IMPORT_BUTTON = /^Import [\d,]+ links?$/;

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

type Export = {
	links: {
		id: string;
		url: string;
		tags: string[];
		projects: string[];
		status: string | null;
	}[];
	tags: { id: string; name: string }[];
	projects: { id: string; name: string }[];
};

async function exported(page: Page): Promise<Export> {
	const res = await page.request.get('/api/export.json');
	expect(res.ok()).toBe(true);
	return (await res.json()) as Export;
}
const ours = (url: string) => new URL(url).hostname.endsWith('t0019.example');
/** This file's links as the export shows them: address, tags, projects, status. */
const mine = (e: Export) =>
	e.links
		.filter((l) => ours(l.url))
		.map((l) => ({
			url: l.url,
			tags: [...l.tags].sort(),
			projects: [...l.projects].sort(),
			status: l.status
		}))
		.sort((a, b) => a.url.localeCompare(b.url));

/** Deletes every link, tag and project this file made. */
async function clearMine(page: Page) {
	const e = await exported(page);
	const ids = e.links.filter((l) => ours(l.url)).map((l) => l.id);
	if (ids.length) {
		const res = await page.request.post('/api/links/bulk', { data: { ids, deleted: true } });
		expect(res.ok()).toBe(true);
	}
	const json = { headers: { 'content-type': 'application/json' } };
	for (const t of e.tags.filter((t) => t.name.startsWith('t0019-'))) {
		expect((await page.request.delete(`/api/tags/${t.id}`, json)).ok()).toBe(true);
	}
	for (const p of e.projects.filter((p) => p.name.startsWith('T0019'))) {
		expect((await page.request.delete(`/api/projects/${p.id}`, json)).ok()).toBe(true);
	}
}

/** The whole account as the export shows it, for "nothing was written". */
async function everything(page: Page) {
	const e = await exported(page);
	return {
		links: e.links.map((l) => l.id).sort(),
		tags: e.tags.map((t) => t.name).sort(),
		projects: e.projects.map((p) => p.name).sort()
	};
}

async function openSettings(page: Page) {
	await page.goto('/settings');
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();
}

async function choose(page: Page, name: string, content: string, mimeType = 'text/html') {
	await page.getByLabel('Bookmarks file to import').setInputFiles({
		name,
		mimeType,
		buffer: Buffer.from(content)
	});
	await expect(page.getByTestId('import-preview')).toBeVisible();
}

const facts = (page: Page) => page.getByRole('definition');

test.afterAll(async ({ browser }) => {
	const context = await browser.newContext({ baseURL: origin, storageState: state });
	const page = await context.newPage();
	await clearMine(page);
	await context.close();
});

const now = Math.floor(Date.now() / 1000);

/** A browser's file: the bar, a folder in it with a nested one, Other bookmarks, a folder named as a project. */
const bookmarks = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://bar.t0019.example/" ADD_DATE="${now - 900}">On the bar</A>
        <DT><H3>Reading</H3>
        <DL><p>
            <DT><A HREF="https://read.t0019.example/a" ADD_DATE="${now - 800}" TAGS="t0019-file">Read A</A>
            <DT><H3>Long reads</H3>
            <DL><p>
                <DT><A HREF="https://long.t0019.example/b" ADD_DATE="${now - 700}">Long B</A>
            </DL><p>
        </DL><p>
        <DT><H3>T0019 Existing</H3>
        <DL><p>
            <DT><A HREF="https://existing.t0019.example/c" ADD_DATE="${now - 600}">Existing C</A>
        </DL><p>
    </DL><p>
    <DT><H3>Other bookmarks</H3>
    <DL><p>
        <DT><A HREF="https://other.t0019.example/d" ADD_DATE="${now - 500}">Other D</A>
        <DT><A HREF="https://read.t0019.example/a" ADD_DATE="${now - 400}">Read A again</A>
        <DT><A HREF="javascript:alert(1)">Not a link</A>
    </DL><p>
</DL><p>
`;

const folder = (page: Page, ...path: string[]) =>
	page.getByTestId('import-folders').locator(`li[data-folder="${path.join('/')}"]`);

test('choosing a file writes nothing: it shows links, duplicates, unreadable lines and every folder with its default', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await clearMine(page);
	await openSettings(page);
	const before = await everything(page);
	await choose(page, 'bookmarks.html', bookmarks);
	expect(await everything(page)).toEqual(before);

	await expect(page.getByTestId('import-chosen')).toContainText('bookmarks.html');
	// Links found, already saved (here: once more in the file), could not be read, folders.
	await expect(facts(page)).toHaveText(['6', '1', '1', '5']);
	await expect(page.getByText('Line 26: Not a web address (javascript:alert(1)).')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Import 5 links', exact: true })).toBeVisible();
	await expect(
		page.getByText('1 duplicate will be skipped: already saved, or twice in the file.')
	).toBeVisible();

	const kind = (path: string[]) =>
		page.getByLabel(`What ${path.join(' › ')} becomes`, { exact: true });
	// The browser's own top folders start on No project; the rest on New project named after the folder.
	await expect(kind(['Bookmarks bar'])).toHaveValue('none');
	await expect(kind(['Other bookmarks'])).toHaveValue('none');
	await expect(kind(['Bookmarks bar', 'Reading'])).toHaveValue('new');
	await expect(
		page.getByLabel('New project name for Bookmarks bar › Reading', { exact: true })
	).toHaveValue('Reading');
	await expect(
		page.getByLabel('New project name for Bookmarks bar › Reading › Long reads', { exact: true })
	).toHaveValue('Reading / Long reads');
	await expect(folder(page, 'Bookmarks bar', 'Reading')).toContainText('1 link');
	await expect(folder(page, 'Other bookmarks')).toContainText('2 links');
	// The Pocket switch is for Pocket files only.
	await expect(page.getByLabel('Keep the file’s tags')).toBeChecked();
	await expect(page.getByText('Mark links you’d read in Pocket as Done')).toHaveCount(0);

	// Cancel throws it away: no preview, nothing written.
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByTestId('import-preview')).toHaveCount(0);
	await expect(page.getByTestId('import-chosen')).toHaveCount(0);
	expect(await everything(page)).toEqual(before);
});

test('Import writes what the mapping says: a renamed new project, an existing one, a tag, and no project (Unsorted)', async ({
	page,
	browserName
}, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await clearMine(page);
	const made = await page.request.post('/api/projects', { data: { name: 'T0019 Existing' } });
	expect(made.ok()).toBe(true);
	await openSettings(page);
	await choose(page, 'bookmarks.html', bookmarks);

	// A folder named as an existing project starts on it.
	await expect(
		page.getByLabel('What Bookmarks bar › T0019 Existing becomes', { exact: true })
	).toHaveValue('existing');
	await expect(
		page.getByLabel('Project for Bookmarks bar › T0019 Existing', { exact: true })
	).toHaveText(/T0019 Existing/);
	// Reading: a new project, renamed.
	await page
		.getByLabel('New project name for Bookmarks bar › Reading', { exact: true })
		.fill('T0019 Shelf');
	// Long reads: a tag.
	await page
		.getByLabel('What Bookmarks bar › Reading › Long reads becomes', { exact: true })
		.selectOption('tag');
	await expect(
		page.getByLabel('Tag name for Bookmarks bar › Reading › Long reads', { exact: true })
	).toHaveValue('long reads');
	await page
		.getByLabel('Tag name for Bookmarks bar › Reading › Long reads', { exact: true })
		.fill('t0019-long');
	// Other bookmarks stays on No project.
	await expect(page.getByTestId('import-tally')).toHaveText(
		'1 new project · 1 existing project · 1 tag · 2 folders to Unsorted'
	);

	// On a phone, "Existing project" fits its select (QA, M-2026-10-25-3cc04598).
	await page.setViewportSize({ width: 390, height: 844 });
	const existingKind = page.getByLabel('What Bookmarks bar › T0019 Existing becomes', {
		exact: true
	});
	const fit = await existingKind.evaluate((el) => {
		const select = el as HTMLSelectElement;
		const style = getComputedStyle(select);
		const probe = document.createElement('span');
		probe.style.font = style.font;
		probe.style.position = 'absolute';
		probe.style.whiteSpace = 'nowrap';
		probe.textContent = select.selectedOptions[0].text;
		document.body.append(probe);
		const text = probe.getBoundingClientRect().width;
		probe.remove();
		const room =
			select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
		return { text: select.selectedOptions[0].text, fits: text <= room };
	});
	expect(fit).toEqual({ text: 'Existing project', fits: true });
	await folder(page, 'Bookmarks bar', 'T0019 Existing').screenshot({
		path: testInfo.outputPath(`existing-row-${browserName}-390.png`)
	});
	await page.setViewportSize({ width: 1440, height: 1000 });

	// A blank name holds the import back.
	await page.getByLabel('New project name for Bookmarks bar › Reading', { exact: true }).fill(' ');
	await expect(page.getByText('One folder needs a name or a project.')).toBeVisible();
	await expect(page.getByRole('button', { name: IMPORT_BUTTON })).toBeDisabled();
	await page
		.getByLabel('New project name for Bookmarks bar › Reading', { exact: true })
		.fill('T0019 Shelf');

	await page.getByRole('button', { name: IMPORT_BUTTON }).click();
	const summary = page.getByTestId('import-summary');
	await expect(summary).toContainText('5 links added');
	// T0019 Shelf made; T0019 Existing joined, not counted.
	await expect(summary).toContainText('1 project made');
	await expect(summary).toContainText('1 duplicate skipped');
	await expect(summary).toContainText('1 line could not be read');
	await expect(page.getByTestId('import-preview')).toHaveCount(0);

	expect(mine(await exported(page))).toEqual([
		{ url: 'https://bar.t0019.example/', tags: [], projects: [], status: null },
		{
			url: 'https://existing.t0019.example/c',
			tags: [],
			projects: ['T0019 Existing'],
			status: null
		},
		{ url: 'https://long.t0019.example/b', tags: ['t0019-long'], projects: [], status: null },
		{ url: 'https://other.t0019.example/d', tags: [], projects: [], status: null },
		{
			url: 'https://read.t0019.example/a',
			tags: ['t0019-file'],
			projects: ['T0019 Shelf'],
			status: null
		}
	]);
	// The existing project was reused, not copied.
	const projects = (await exported(page)).projects.filter((p) => p.name.startsWith('T0019'));
	expect(projects.map((p) => p.name).sort()).toEqual(['T0019 Existing', 'T0019 Shelf']);

	// The no-project links are in Unsorted.
	await page.goto('/unsorted');
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();
	await expect(page.getByText('On the bar', { exact: true })).toBeVisible();
	await expect(page.getByText('Other D', { exact: true })).toBeVisible();
	await expect(page.getByText('Existing C', { exact: true })).toHaveCount(0);
});

test('keep tags off drops the file’s tags; the Pocket switch shows for Pocket files and off leaves no status', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await clearMine(page);
	await openSettings(page);
	const pocket =
		'title,url,time_added,tags,status\n' +
		`Pocket one,https://pocket.t0019.example/1,${now},t0019-pocket,archive\n` +
		`Pocket two,https://pocket.t0019.example/2,${now},,unread\n`;
	await page.getByLabel('Bookmarks file to import').setInputFiles({
		name: 'pocket.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(pocket)
	});
	await expect(page.getByTestId('import-preview')).toBeVisible();
	await expect(page.getByTestId('import-folders')).toHaveCount(0);
	const done = page.getByLabel('Mark links you’d read in Pocket as Done');
	await expect(done).toBeChecked();
	await done.uncheck();
	await page.getByLabel('Keep the file’s tags').uncheck();
	await page.getByRole('button', { name: IMPORT_BUTTON }).click();
	await expect(page.getByTestId('import-summary')).toContainText('2 links added');
	expect(mine(await exported(page))).toEqual([
		{ url: 'https://pocket.t0019.example/1', tags: [], projects: [], status: null },
		{ url: 'https://pocket.t0019.example/2', tags: [], projects: [], status: null }
	]);

	// Switched on (the default), archive becomes Done and the tags stay.
	await clearMine(page);
	await openSettings(page);
	await page.getByLabel('Bookmarks file to import').setInputFiles({
		name: 'pocket.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(pocket)
	});
	await expect(page.getByTestId('import-preview')).toBeVisible();
	await page.getByRole('button', { name: IMPORT_BUTTON }).click();
	await expect(page.getByTestId('import-summary')).toContainText('2 links added');
	expect(mine(await exported(page))).toEqual([
		{ url: 'https://pocket.t0019.example/1', tags: ['t0019-pocket'], projects: [], status: 'done' },
		{ url: 'https://pocket.t0019.example/2', tags: [], projects: [], status: null }
	]);
});

/** A file with 200 folders (some nested, some long names), 3 links each. */
function manyFolders() {
	let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n';
	html += '<DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>\n<DL><p>\n';
	for (let f = 0; f < 200; f++) {
		const name =
			f % 17 === 0
				? `T0019 A folder with a much longer name than most, number ${f}`
				: `T0019 Folder ${f}`;
		html += `<DT><H3>${name}</H3>\n<DL><p>\n`;
		for (let i = 0; i < 3; i++) {
			html += `<DT><A HREF="https://f${f}.t0019.example/${i}">Link ${f}.${i}</A>\n`;
		}
		html += '</DL><p>\n';
	}
	return html + '</DL><p>\n</DL><p>\n';
}

test('the preview at 390 and 1440, light and dark; 200 folders scroll in their own list', async ({
	page,
	browserName
}, testInfo) => {
	await clearMine(page);
	const many = manyFolders();
	for (const scheme of ['light', 'dark'] as const) {
		for (const width of [390, 1440]) {
			await page.emulateMedia({ colorScheme: scheme });
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
			await openSettings(page);
			await choose(page, 'bookmarks.html', bookmarks);
			const preview = page.getByTestId('import-preview');
			await preview.scrollIntoViewIfNeeded();
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
			).toBe(true);
			await page.getByRole('heading', { name: 'Import' }).scrollIntoViewIfNeeded();
			await page.screenshot({
				path: testInfo.outputPath(`preview-${browserName}-${width}-${scheme}.png`),
				fullPage: true
			});

			await choose(page, 'many.html', many);
			await expect(facts(page)).toHaveText(['600', '0', '0', '200']);
			const list = page.getByTestId('import-folders');
			const box = await list.evaluate((el) => ({
				scrolls: el.scrollHeight > el.clientHeight,
				height: el.clientHeight,
				viewport: window.innerHeight
			}));
			// The folders scroll inside their own box, at most half the screen tall.
			expect(box.scrolls).toBe(true);
			expect(box.height).toBeLessThanOrEqual(box.viewport / 2 + 2);
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
			).toBe(true);
			// The last folder is reachable in the list, and its controls work.
			const last = folder(page, 'Bookmarks bar', 'T0019 Folder 199');
			await last.scrollIntoViewIfNeeded();
			await page
				.getByLabel('What Bookmarks bar › T0019 Folder 199 becomes', { exact: true })
				.selectOption('none');
			await expect(last).toContainText('Links land in Unsorted');
			await page.getByRole('heading', { name: 'Import' }).scrollIntoViewIfNeeded();
			await page.screenshot({
				path: testInfo.outputPath(`preview-200-${browserName}-${width}-${scheme}.png`),
				fullPage: true
			});
			await page.getByRole('button', { name: 'Cancel' }).click();
		}
	}
	expect(mine(await exported(page))).toEqual([]);
});
