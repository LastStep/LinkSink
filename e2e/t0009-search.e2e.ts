import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

// Search as you type, filters in the address, sort, paging, keys and the command palette (T-0009). Runs after the
// other files on the same server (one worker, name order) or alone; every link it makes carries a word of its own,
// so the links other files made never change what it sees.
const port = Number(process.env.E2E_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const email = 'person@example.com';
const password = 'correct horse battery staple';
const state = 'data/e2e/t0009-session.json';

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

type Link = { id: string; url: string; title: string };

const save = async (page: Page, url: string, title: string, patch: object = {}): Promise<Link> => {
	const res = await page.request.post('/api/links', { data: { url, title, via: 'paste' } });
	expect(res.ok()).toBe(true);
	const link = (await res.json()).link as Link;
	if (Object.keys(patch).length) {
		const p = await page.request.patch(`/api/links/${link.id}`, { data: patch });
		expect(p.ok()).toBe(true);
	}
	return link;
};
const makeTag = async (page: Page, name: string) =>
	(await (await page.request.post('/api/tags', { data: { name } })).json()).tag as { id: string };
const makeProject = async (page: Page, name: string) =>
	(await (await page.request.post('/api/projects', { data: { name, color: 'teal' } })).json())
		.project as { id: string };

const rows = (page: Page) => page.locator('ul.ledger li.row');
const titles = (page: Page) => rows(page).locator('a.t');
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search' });

async function ready(page: Page, path: string) {
	await page.goto(path);
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();
}

/** A mark on the window that a page load would wipe. */
const markWindow = (page: Page) => page.evaluate(() => ((window as { t9?: number }).t9 = 1));
const stillSameWindow = (page: Page) => page.evaluate(() => (window as { t9?: number }).t9 === 1);

test('results follow each keystroke within 150 ms of the last one, with no page load', async ({
	page
}) => {
	await save(page, 'https://t9type.example.com/zebra', 'T9type zebra stripes');
	await save(page, 'https://t9type.example.com/zebu', 'T9type zebu farming');
	await save(page, 'https://t9type.example.com/lion', 'T9type lion mane');
	await ready(page, '/');
	await markWindow(page);
	await expect(search(page)).toHaveAttribute('placeholder', 'Filter as you type');

	// Each sample: type a query, and time from its last keydown to the first frame where the list shows exactly
	// the rows it should (a MutationObserver over the ledger, in the page's own clock).
	const samples: number[] = [];
	const queries: [string, string[]][] = [
		['t9type zebr', ['T9type zebra stripes']],
		['t9type ze', ['T9type zebra stripes', 'T9type zebu farming']],
		['t9type lio', ['T9type lion mane']],
		['t9type zebu', ['T9type zebu farming']],
		['t9type', ['T9type lion mane', 'T9type zebu farming', 'T9type zebra stripes']]
	];
	for (const [query, want] of queries) {
		await search(page).fill('');
		await search(page).focus();
		await page.evaluate((wanted) => {
			const w = window as unknown as { t9last: number; t9done: Promise<number> };
			w.t9last = 0;
			document.addEventListener('keydown', () => (w.t9last = performance.now()), {
				capture: true
			});
			const same = () => {
				const shown = [...document.querySelectorAll('ul.ledger li.row a.t')].map(
					(a) => a.textContent ?? ''
				);
				return shown.length === wanted.length && wanted.every((t) => shown.includes(t));
			};
			w.t9done = new Promise((resolve) => {
				const seen = new MutationObserver(() => {
					// only once typing has started and the last keystroke is in
					if (w.t9last && same()) {
						seen.disconnect();
						resolve(performance.now());
					}
				});
				seen.observe(document.querySelector('main')!, {
					childList: true,
					subtree: true,
					characterData: true
				});
			});
		}, want);
		await page.keyboard.type(query, { delay: 25 });
		const elapsed = await page.evaluate(async () => {
			const w = window as unknown as { t9last: number; t9done: Promise<number> };
			const done = await w.t9done;
			return done - w.t9last;
		});
		samples.push(Math.round(elapsed));
		expect((await titles(page).allInnerTexts()).sort()).toEqual([...want].sort());
	}
	console.log(`[t0009] keystroke to results, ms: ${samples.join(', ')}`);
	test
		.info()
		.annotations.push({ type: 'keystroke-to-results-ms', description: samples.join(', ') });
	for (const ms of samples) expect(ms).toBeLessThanOrEqual(150);

	// the address follows, and nothing reloaded
	await expect(page).toHaveURL(/\/\?q=t9type$/);
	expect(await stillSameWindow(page)).toBe(true);

	// a reload brings the same search back
	await page.reload();
	await expect(search(page)).toHaveValue('t9type');
	await expect(rows(page)).toHaveCount(3);

	// Esc clears it
	await search(page).focus();
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(/\/$/);
	await expect(search(page)).toHaveValue('');
});

test('a quoted phrase matches words in a row; the last word is a prefix, earlier ones whole', async ({
	page
}) => {
	await save(page, 'https://t9phrase.example.com/a', 'T9phrase deep learning notes');
	await save(page, 'https://t9phrase.example.com/b', 'T9phrase learning deep water');
	await ready(page, '/?q=t9phrase%20%22deep%20learning%22');
	await expect(titles(page)).toHaveText(['T9phrase deep learning notes']);
	await ready(page, '/?q=t9phrase%20learn');
	await expect(rows(page)).toHaveCount(2);
	await ready(page, '/?q=t9phrase%20learning%20dee');
	await expect(rows(page)).toHaveCount(2);
	await ready(page, '/?q=t9phrase%20learn%20deep');
	await expect(page.getByText('Nothing matches')).toBeVisible();
});

test('filters combine as the one-pager says, live in the address, and a reload reproduces the view', async ({
	page
}) => {
	const ai = await makeTag(page, 't9 ai');
	const rec = await makeTag(page, 't9 recommendations');
	const work = await makeProject(page, 'T9 Work');
	await save(page, 'https://t9filter.example.com/both', 'T9filter both tags', {
		tagIds: [ai.id, rec.id],
		status: 'to_read',
		priority: 3,
		projectIds: [work.id]
	});
	await save(page, 'https://t9filter.example.com/ai', 'T9filter ai only', {
		tagIds: [ai.id],
		status: 'done',
		priority: 1
	});
	await save(page, 'https://t9filter.example.com/rec', 'T9filter rec only', {
		tagIds: [rec.id],
		status: 'in_progress'
	});
	await save(page, 'https://t9filter.example.com/none', 'T9filter nothing set');
	await save(page, 'https://t9filter.example.com/old', 'T9filter archived', {
		tagIds: [ai.id],
		archived: true
	});

	await page.setViewportSize({ width: 1440, height: 900 });
	await ready(page, '/?q=t9filter');
	await markWindow(page);
	await expect(rows(page)).toHaveCount(4);

	await page.getByRole('button', { name: 'Filters' }).click();
	const panel = page.getByRole('dialog', { name: 'Filters' });
	await expect(panel).toBeVisible();
	// status and priority options carry the StateMark marks
	const statusGroup = panel.getByRole('group', { name: 'Status' });
	await expect(statusGroup.locator('svg.state-mark[data-kind="status"]')).toHaveCount(4);
	await expect(
		panel.getByRole('group', { name: 'Priority' }).locator('svg.state-mark[data-kind="priority"]')
	).toHaveCount(4);

	// two tags in one filter: links with either
	const tags = panel.getByRole('group', { name: /Tags/ });
	await tags.getByText('t9 ai', { exact: true }).click();
	await tags.getByText('t9 recommendations', { exact: true }).click();
	await expect(titles(page)).toHaveText([
		'T9filter rec only',
		'T9filter ai only',
		'T9filter both tags'
	]);
	await expect(page).toHaveURL(new RegExp(`tags=${ai.id},${rec.id}`));
	// the all switch: both tags
	await tags.getByRole('radio', { name: 'All' }).click();
	await expect(titles(page)).toHaveText(['T9filter both tags']);
	await expect(page).toHaveURL(/tagmode=all/);
	await tags.getByRole('radio', { name: 'Any' }).click();

	// a second filter narrows: status To read or Done, across with the tags
	await statusGroup.getByText('To read', { exact: true }).click();
	await statusGroup.getByText('Done', { exact: true }).click();
	await expect(titles(page)).toHaveText(['T9filter ai only', 'T9filter both tags']);
	// priority High narrows again
	await panel.getByRole('group', { name: 'Priority' }).getByText('High', { exact: true }).click();
	await expect(titles(page)).toHaveText(['T9filter both tags']);
	await expect(page).toHaveURL(
		new RegExp(
			`^${origin}/\\?q=t9filter&tags=${ai.id},${rec.id}&status=to_read,done&priority=high$`
		)
	);
	expect(await stillSameWindow(page)).toBe(true);
	await page.screenshot({ path: test.info().outputPath('filters-open-1440.png') });

	// the chips say what is on; a reload brings back the same view, chips and all
	await page.keyboard.press('Escape');
	await expect(panel).toBeHidden();
	const chips = page.locator('.chips');
	await expect(chips).toContainText('Status');
	await expect(chips).toContainText('To read, Done');
	await expect(chips.locator('svg.state-mark[data-kind="status"]')).toHaveCount(2);
	await page.reload();
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();
	await expect(titles(page)).toHaveText(['T9filter both tags']);
	await expect(page.locator('.chips')).toContainText('Priority');
	await expect(page.getByRole('button', { name: /Filters/ })).toContainText('3');

	// a chip's x takes its filter off
	await page.getByRole('button', { name: /Remove Priority/ }).click();
	await expect(titles(page)).toHaveText(['T9filter ai only', 'T9filter both tags']);

	// No status, then archived links included and only
	await ready(page, '/?q=t9filter&status=none');
	await expect(titles(page)).toHaveText(['T9filter nothing set']);
	await ready(page, `/?q=t9filter&tags=${ai.id}`);
	await expect(rows(page)).toHaveCount(2);
	await page.getByRole('button', { name: /Filters/ }).click();
	await page.getByRole('radio', { name: 'Include' }).click();
	await expect(rows(page)).toHaveCount(3);
	await expect(page).toHaveURL(/archived=include/);
	await page.getByRole('radio', { name: 'Only archived' }).click();
	await expect(titles(page)).toHaveText(['T9filter archived']);

	// projects and media
	await ready(page, `/?q=t9filter&projects=${work.id}`);
	await expect(titles(page)).toHaveText(['T9filter both tags']);
	await ready(page, '/?q=t9filter&media=video');
	await expect(page.getByText('with these filters')).toBeVisible();
});

test('sort by title or priority, and paging in 50s as the list scrolls', async ({ page }) => {
	const titlesIn: string[] = [];
	for (let i = 0; i < 62; i++) {
		const title = `T9page ${['delta', 'alpha', 'charlie', 'bravo'][i % 4]} ${String(i).padStart(2, '0')}`;
		titlesIn.push(title);
		await save(page, `https://t9page.example.com/${i}`, title, i % 5 === 0 ? { priority: 3 } : {});
	}
	await ready(page, '/?q=t9page');
	await expect(rows(page)).toHaveCount(50);
	await expect(page.locator('.toolbar .count')).toHaveText('62 links');
	await page.locator('.more').scrollIntoViewIfNeeded();
	await expect(rows(page)).toHaveCount(62);
	// newest first, no repeats
	const shown = await titles(page).allInnerTexts();
	expect(new Set(shown).size).toBe(62);
	expect(shown[0]).toBe(titlesIn[61]);

	await ready(page, '/?q=t9page&sort=title');
	await expect(rows(page)).toHaveCount(50);
	const first = await titles(page).allInnerTexts();
	expect(first).toEqual([...titlesIn].sort().slice(0, 50));
	await expect(page.locator('.day-h h2').first()).toContainText('A to Z');

	await ready(page, '/?q=t9page&sort=priority');
	await expect(page.locator('.day-h h2').first()).toContainText('High priority');
	await expect(rows(page).first().locator('.st-prio')).toContainText('High');

	// choosing a sort in the panel writes it to the address
	await ready(page, '/?q=t9page');
	await page.getByRole('button', { name: /Filters/ }).click();
	await page.getByRole('combobox', { name: 'Sort' }).selectOption('title');
	await expect(page).toHaveURL(/sort=title/);
	await expect(titles(page).first()).toHaveText([...titlesIn].sort()[0]);
});

test('a filtered list drops a link that stops matching, as a view does, and keeps its open details; a paste that does not match says so', async ({
	page
}) => {
	await save(page, 'https://t9leave.example.com/a', 'T9leave first', { status: 'to_read' });
	await save(page, 'https://t9leave.example.com/b', 'T9leave second', { status: 'to_read' });
	await page.setViewportSize({ width: 1440, height: 900 });
	await ready(page, '/?q=t9leave&status=to_read');
	await expect(rows(page)).toHaveCount(2);
	// open one and mark it Done: its row leaves at once (T-0015's rule for views), its details stay open and working
	await rows(page).filter({ hasText: 'T9leave first' }).locator('time').click();
	await page
		.getByRole('radiogroup', { name: 'Status' })
		.getByRole('radio', { name: 'Done' })
		.click();
	await expect(titles(page)).toHaveText(['T9leave second']);
	await expect(page.getByLabel('Link title')).toHaveValue('T9leave first');
	await page
		.getByRole('radiogroup', { name: 'Status' })
		.getByRole('radio', { name: 'To read' })
		.click();
	await expect(rows(page)).toHaveCount(2);
	await page
		.getByRole('radiogroup', { name: 'Status' })
		.getByRole('radio', { name: 'Done' })
		.click();
	await page.keyboard.press('Escape');
	await expect(titles(page)).toHaveText(['T9leave second']);

	// a paste here saves, but the filters leave it out, and the page says so
	await page.getByLabel('Link', { exact: true }).fill('https://t9leave.example.com/new');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('status').filter({ hasText: 'does not match' })).toBeVisible();
	await expect(titles(page)).toHaveText(['T9leave second']);
});

test('keys: / n j k arrows Enter e t p a x', async ({ page }) => {
	await save(page, 'https://t9keys.example.com/3', 'T9keys three');
	await save(page, 'https://t9keys.example.com/2', 'T9keys two');
	await save(page, 'https://t9keys.example.com/1', 'T9keys one');
	await page.setViewportSize({ width: 1440, height: 900 });
	await ready(page, '/?q=t9keys');
	await expect(rows(page)).toHaveCount(3);
	await page.locator('h1').click();

	await page.keyboard.press('/');
	await expect(search(page)).toBeFocused();
	await page.keyboard.press('Escape'); // Esc in the box clears the search
	await expect(page).toHaveURL(/\/$/);
	await ready(page, '/?q=t9keys');
	await page.locator('h1').click();
	await page.keyboard.press('n');
	await expect(page.getByLabel('Link', { exact: true })).toBeFocused();
	await page.locator('h1').click();

	const focusedTitle = () =>
		page.evaluate(() => document.activeElement?.querySelector('a.t')?.textContent ?? null);
	await page.keyboard.press('j');
	expect(await focusedTitle()).toBe('T9keys one');
	await page.keyboard.press('j');
	expect(await focusedTitle()).toBe('T9keys two');
	await page.keyboard.press('ArrowDown');
	expect(await focusedTitle()).toBe('T9keys three');
	await page.keyboard.press('k');
	expect(await focusedTitle()).toBe('T9keys two');
	await page.keyboard.press('ArrowUp');
	expect(await focusedTitle()).toBe('T9keys one');

	// Enter opens the details; j moves them along
	await page.keyboard.press('Enter');
	await expect(page.getByLabel('Link title')).toHaveValue('T9keys one');
	await page.keyboard.press('j');
	await expect(page.getByLabel('Link title')).toHaveValue('T9keys two');
	await page.keyboard.press('Escape');

	// e edits the title
	await rows(page).filter({ hasText: 'T9keys two' }).focus();
	await page.keyboard.press('e');
	await expect(page.getByLabel('Link title')).toBeFocused();
	await expect(page.getByLabel('Link title')).toHaveValue('T9keys two');
	await page.keyboard.press('Escape'); // leaves the field
	await page.keyboard.press('Escape'); // closes the details

	// t and p open the organiser on tags and on projects
	await rows(page).filter({ hasText: 'T9keys two' }).focus();
	await page.keyboard.press('t');
	await expect(page.locator('.picker')).toBeVisible();
	await expect(page.locator('.picker')).toContainText(/tags/i);
	await page.keyboard.press('Escape');
	await expect(page.locator('.picker')).toBeHidden();
	await rows(page).filter({ hasText: 'T9keys two' }).focus();
	await page.keyboard.press('p');
	await expect(page.locator('.picker')).toContainText(/projects/i);
	await page.keyboard.press('Escape');

	// x selects
	await rows(page).filter({ hasText: 'T9keys one' }).focus();
	await page.keyboard.press('x');
	await expect(rows(page).filter({ hasText: 'T9keys one' })).toHaveClass(/selected/);
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape');

	// a archives the focused row: it leaves the list, with an undo
	await rows(page).filter({ hasText: 'T9keys three' }).focus();
	await page.keyboard.press('a');
	await expect(page.locator('.toast')).toContainText('Archived');
	await expect(rows(page)).toHaveCount(2);
});

test('Ctrl/Cmd+K opens the palette: add, search, jump to a project, tag or source, go to Unsorted, Archive, Settings', async ({
	page
}) => {
	const project = await makeProject(page, 'T9 Palette project');
	const tag = await makeTag(page, 't9 palette tag');
	await save(page, 'https://t9palette.example.com/a', 'T9palette alpha');
	await page.setViewportSize({ width: 1440, height: 900 });
	await ready(page, '/');
	const palette = page.getByRole('dialog', { name: 'Command palette' });
	const open = async () => {
		await page.keyboard.press('ControlOrMeta+k');
		await expect(palette).toBeVisible();
	};
	const run = async (text: string) => {
		await open();
		await page.getByRole('combobox', { name: 'Command' }).fill(text);
		await page.keyboard.press('Enter');
		await expect(palette).toBeHidden();
	};

	await open();
	await expect(palette.getByRole('option')).toContainText(['Add a link', 'Search links']);
	await page.screenshot({ path: test.info().outputPath('palette-1440.png') });
	await page.keyboard.press('Escape');
	await expect(palette).toBeHidden();

	await run('T9 Palette project');
	await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
	await run('t9 palette tag');
	await expect(page).toHaveURL(new RegExp(`/tags/${tag.id}$`));
	await run('Unsorted');
	await expect(page).toHaveURL(/\/unsorted$/);
	await run('Archive');
	await expect(page).toHaveURL(/\/archive$/);
	await run('Settings');
	await expect(page).toHaveURL(/\/settings$/);

	// a source: the links from it
	const sources = (await (await page.request.get('/api/organise')).json()).sources as {
		id: string;
		name: string;
	}[];
	expect(sources.length).toBeGreaterThan(0);
	await run(sources[0].name);
	await expect(page).toHaveURL(new RegExp(`/\\?source=${sources[0].id}$`));

	// search from anywhere
	await ready(page, '/settings');
	await run('t9palette');
	await expect(page).toHaveURL(/\/\?q=t9palette$/);
	await expect(titles(page)).toHaveText(['T9palette alpha']);

	// add: a pasted link is saved from the palette, from any screen
	await ready(page, '/settings');
	await run('https://t9palette.example.com/added');
	await expect(page).toHaveURL(/\/$/);
	await expect(page.locator('a.t[href="https://t9palette.example.com/added"]')).toBeVisible();
	// and "Add a link" puts the cursor in the paste box
	await run('Add a link');
	await expect(page.getByLabel('Link', { exact: true })).toBeFocused();
});
