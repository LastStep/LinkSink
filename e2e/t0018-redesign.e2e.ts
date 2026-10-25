import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

// The redesign (T-0018, ADR-0005): two-line rows with a fixed state cell, one set of marks, radio-list status and
// priority, the details panel, the frame and the phone's tab bar. Runs after the other files on the same server (one
// worker, name order); makes the account itself when run alone. Each test saves links under its own host.
const port = Number(process.env.E2E_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const email = 'person@example.com';
const password = 'correct horse battery staple';
const state = 'data/e2e/t0018-session.json';

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

type Link = {
	id: string;
	title: string | null;
	tagIds: string[];
	projectIds: string[];
	status: string | null;
	priority: number | null;
	archivedAt: number | null;
};

const linkById = async (page: Page, id: string): Promise<Link> => {
	const res = await page.request.get(`/api/links/${id}`);
	expect(res.ok()).toBe(true);
	return (await res.json()).link;
};

async function save(
	page: Page,
	url: string,
	fields: Partial<Pick<Link, 'title' | 'tagIds' | 'projectIds' | 'status' | 'priority'>> = {}
): Promise<Link> {
	const { status, priority, ...create } = fields;
	const res = await page.request.post('/api/links', { data: { url, via: 'paste', ...create } });
	expect(res.ok()).toBe(true);
	const link = (await res.json()).link as Link;
	if (status !== undefined || priority !== undefined)
		await page.request.patch(`/api/links/${link.id}`, { data: { status, priority } });
	return link;
}

const makeTag = async (page: Page, name: string) =>
	(await (await page.request.post('/api/tags', { data: { name } })).json()).tag as {
		id: string;
	};
const makeProject = async (page: Page, name: string, color = 'green') =>
	(await (await page.request.post('/api/projects', { data: { name, color } })).json()).project as {
		id: string;
	};

const row = (page: Page, host: string, path = '') =>
	page.locator('li.row', { has: page.locator(`a[href^="https://${host}${path}"]`) });

async function ready(page: Page, path: string) {
	await page.goto(path);
	await expect(page.locator('main[data-ready="true"]')).toBeVisible();
}

/** The left edges of the state cells of every row on screen, rounded to the pixel. */
const stateEdges = (page: Page) =>
	page
		.locator('li.row .c-state')
		.evaluateAll((cells) => [
			...new Set(cells.map((c) => Math.round(c.getBoundingClientRect().left)))
		]);

const color = (l: Locator) => l.evaluate((el) => getComputedStyle(el).color);
const tokenColor = (page: Page, token: string) =>
	page.evaluate((t) => {
		const probe = document.createElement('span');
		probe.style.color = `var(${t})`;
		document.body.append(probe);
		const c = getComputedStyle(probe).color;
		probe.remove();
		return c;
	}, token);

test('every list shows two-line rows with the state cell on one left edge (1440)', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const tag = await makeTag(page, 'row-tag');
	const project = await makeProject(page, 'Row project', 'violet');
	const full = await save(page, 'https://rows.example.com/full', {
		title: 'A link with everything set on it',
		tagIds: [tag.id],
		projectIds: [project.id],
		status: 'in_progress',
		priority: 3
	});
	await save(page, 'https://rows.example.com/bare', { title: 'A bare link' });
	await save(page, 'https://rows.example.com/done', {
		title: 'A link that is done and low',
		tagIds: [tag.id],
		status: 'done',
		priority: 1
	});
	const gone = await save(page, 'https://rows.example.com/archived', {
		title: 'An archived link',
		status: 'to_read'
	});
	await page.request.patch(`/api/links/${gone.id}`, { data: { archived: true } });

	await ready(page, '/');
	const r = row(page, 'rows.example.com', '/full');
	// Line one: the title. Line two: the source, the project as dot and name, the tags as text.
	await expect(r.locator('a.t')).toHaveText('A link with everything set on it');
	const meta = r.locator('.meta-line');
	await expect(meta.locator('.m-src')).toHaveText('rows.example.com');
	await expect(meta.locator('.m-proj')).toHaveText('Row project');
	await expect(meta.locator('.m-proj .dot')).toHaveCount(1);
	await expect(meta.locator('.m-tag')).toHaveText(['row-tag']);
	const title = (await r.locator('a.t').boundingBox())!;
	const line2 = (await meta.boundingBox())!;
	expect(line2.y).toBeGreaterThanOrEqual(title.y + title.height - 1);
	// The fixed cell: the status (mark and word) over the priority (bars and word).
	await expect(r.locator('.st-status')).toHaveText('In progress');
	await expect(r.locator('.st-prio')).toHaveText('High');
	const st = (await r.locator('.st-status').boundingBox())!;
	const pr = (await r.locator('.st-prio').boundingBox())!;
	expect(pr.y).toBeGreaterThanOrEqual(st.y + st.height - 1);
	expect(Math.round(pr.x)).toBe(Math.round(st.x));
	// Across every row on the screen the state cell starts at one left edge.
	expect(await page.locator('li.row').count()).toBeGreaterThanOrEqual(3);
	expect(await stateEdges(page)).toHaveLength(1);
	await page.screenshot({ path: test.info().outputPath('rows-1440.png') });

	// The same row on every other list.
	for (const [path, host] of [
		[`/tags/${tag.id}`, '/full'],
		[`/projects/${project.id}`, '/full'],
		['/unsorted', '/bare'],
		['/archive', '/archived']
	]) {
		await ready(page, path);
		const one = row(page, 'rows.example.com', host);
		await expect(one.locator('.meta-line')).toBeVisible();
		await expect(one.locator('.c-state .st-status')).toBeVisible();
		await expect(one.locator('.c-state .st-prio')).toBeVisible();
		expect(await stateEdges(page)).toHaveLength(1);
	}
	expect((await linkById(page, full.id)).archivedAt).toBeNull();
});

test('at 390 no name on a row’s second line is cut: what does not fit is left out whole', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const tags = [];
	for (const name of [
		'photography-workflows',
		'self-hosted-services',
		'reading-list-2026',
		'tools'
	])
		tags.push((await makeTag(page, name)).id);
	const projects = [
		(await makeProject(page, 'Long running research', 'blue')).id,
		(await makeProject(page, 'Weekend garden', 'green')).id
	];
	await save(page, 'https://narrow.example.com/many', {
		title: 'A link carrying many long names',
		tagIds: tags,
		projectIds: projects,
		status: 'in_progress',
		priority: 2
	});
	await save(page, 'https://narrow.example.com/few', {
		title: 'A link with one tag',
		tagIds: [tags[3]],
		status: 'done'
	});
	await ready(page, '/');
	await page.screenshot({ path: test.info().outputPath('rows-390.png') });

	for (const r of await page.locator('li.row').all()) {
		const check = await r.locator('.meta-line').evaluate((line) => {
			const box = line.getBoundingClientRect();
			const items = [...line.querySelectorAll<HTMLElement>('.m')].filter(
				(el) => getComputedStyle(el).display !== 'none'
			);
			const shown = items.filter((el) => el.getBoundingClientRect().top < box.bottom - 1);
			return {
				lineRight: box.right,
				rowRight: line.closest('li')!.getBoundingClientRect().right,
				shown: shown.map((el) => ({
					right: el.getBoundingClientRect().right,
					clipped: el.scrollWidth > el.clientWidth + 1
				})),
				dropped: items.length - shown.length
			};
		});
		for (const item of check.shown) {
			expect(item.right).toBeLessThanOrEqual(check.lineRight + 0.5);
			expect(item.right).toBeLessThanOrEqual(check.rowRight);
			expect(item.clipped).toBe(false);
		}
	}
	// The long row really drops items (so the check above saw a crowded line), and keeps the status first.
	const many = row(page, 'narrow.example.com', '/many').locator('.meta-line');
	const dropped = await many.evaluate((line) => {
		const bottom = line.getBoundingClientRect().bottom;
		return [...line.querySelectorAll<HTMLElement>('.m')].filter(
			(el) => el.getBoundingClientRect().top >= bottom - 1
		).length;
	});
	expect(dropped).toBeGreaterThan(0);
	await expect(many.locator('.m').first()).toHaveText('In progress');
	await expect(many.locator('.m').first()).toBeVisible();
});

test('one StateMark draws the marks: dashed circle and faint dash unset, Done in --positive, High in --negative', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await save(page, 'https://marks.example.com/unset', { title: 'Nothing set' });
	await save(page, 'https://marks.example.com/set', {
		title: 'Done and high',
		status: 'done',
		priority: 3
	});
	await ready(page, '/');
	const unset = row(page, 'marks.example.com', '/unset');
	await expect(unset.locator('.st-status svg')).toHaveAttribute('data-mark', 'dashed');
	await expect(unset.locator('.st-prio svg')).toHaveAttribute('data-mark', 'bars-0');
	const set = row(page, 'marks.example.com', '/set');
	await expect(set.locator('.st-status svg')).toHaveAttribute('data-mark', 'check');
	await expect(set.locator('.st-prio svg')).toHaveAttribute('data-mark', 'bars-3');
	expect(await color(set.locator('.st-status svg'))).toBe(await tokenColor(page, '--positive'));
	expect(await color(set.locator('.st-prio svg'))).toBe(await tokenColor(page, '--negative'));

	// The same marks in the details and in the organiser.
	await set.locator('time').click();
	const detail = page.getByRole('complementary', { name: 'Link details' });
	await expect(detail.locator('svg.state-mark[data-mark="check"]')).toHaveCount(1);
	await expect(detail.locator('svg.state-mark[data-mark="dashed"]')).toHaveCount(1);
	await expect(detail.locator('svg.state-mark[data-mark="bars-3"]')).toHaveCount(1);
	await detail.getByRole('button', { name: 'Organise' }).click();
	const picker = page.getByRole('dialog', { name: /Organise/ });
	await expect(picker.locator('svg.state-mark')).toHaveCount(8);
	await expect(
		picker.getByRole('radiogroup', { name: 'Status' }).getByRole('radio', { name: 'Done' })
	).toHaveAttribute('aria-checked', 'true');
	await page.keyboard.press('Escape');
});

test('in the details, status and priority are radio lists of four that save at once, by mouse and by keys', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const link = await save(page, 'https://radios.example.com/one', { title: 'Radio lists' });
	await ready(page, '/');
	await row(page, 'radios.example.com').locator('time').click();
	const detail = page.getByRole('complementary', { name: 'Link details' });
	const status = detail.getByRole('radiogroup', { name: 'Status' });
	const priority = detail.getByRole('radiogroup', { name: 'Priority' });
	await expect(status.getByRole('radio')).toHaveText([
		'No status',
		'To read',
		'In progress',
		'Done'
	]);
	await expect(priority.getByRole('radio')).toHaveText(['No priority', 'Low', 'Medium', 'High']);
	await expect(status.getByRole('radio', { name: 'No status' })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	// Side by side.
	const s = (await status.boundingBox())!;
	const p = (await priority.boundingBox())!;
	expect(Math.round(p.y)).toBe(Math.round(s.y));
	expect(p.x).toBeGreaterThan(s.x + s.width - 1);

	// A click saves at once.
	await status.getByRole('radio', { name: 'Done' }).click();
	await expect.poll(async () => (await linkById(page, link.id)).status).toBe('done');
	// One radio of each group is in the tab order: the chosen one.
	await expect(status.locator('[role="radio"][tabindex="0"]')).toHaveText('Done');
	// Arrow keys move and choose, wrapping round the group.
	await status.getByRole('radio', { name: 'Done' }).focus();
	await page.keyboard.press('ArrowDown');
	await expect(status.getByRole('radio', { name: 'No status' })).toBeFocused();
	await expect.poll(async () => (await linkById(page, link.id)).status).toBeNull();
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await expect(status.getByRole('radio', { name: 'In progress' })).toBeFocused();
	await expect.poll(async () => (await linkById(page, link.id)).status).toBe('in_progress');
	// Tab leaves the group for the next one, landing on its chosen radio.
	await page.keyboard.press('Tab');
	await expect(priority.getByRole('radio', { name: 'No priority' })).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await expect.poll(async () => (await linkById(page, link.id)).priority).toBe(2);
	// A reload keeps them.
	await ready(page, '/');
	await row(page, 'radios.example.com').locator('time').click();
	await expect(
		detail.getByRole('radiogroup', { name: 'Status' }).getByRole('radio', { name: 'In progress' })
	).toHaveAttribute('aria-checked', 'true');
	await expect(
		detail.getByRole('radiogroup', { name: 'Priority' }).getByRole('radio', { name: 'Medium' })
	).toHaveAttribute('aria-checked', 'true');
	await expect(row(page, 'radios.example.com').locator('.st-prio')).toHaveText('Medium');
	await page.screenshot({ path: test.info().outputPath('details-radios-1440.png') });
});

for (const size of [
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 }
]) {
	test(`the details panel: wrapping title field, property rows, quiet fields, footer in view (${size.width})`, async ({
		page
	}) => {
		await page.setViewportSize(size);
		const long =
			'A very long title that cannot fit on one line of the details panel and so has to wrap onto the next ones';
		const link = await save(page, `https://panel${size.width}.example.com/one`, { title: long });
		await page.request.patch(`/api/links/${link.id}`, {
			data: { description: 'Words of a long description. '.repeat(80) }
		});
		await ready(page, '/');
		await row(page, `panel${size.width}.example.com`).locator('time').click();
		const detail = page.getByRole('complementary', { name: 'Link details' });
		await expect(detail).toBeVisible();
		await page.waitForTimeout(500); // the panel's entrance

		// The footer's buttons are on screen without scrolling.
		for (const name of ['Organise', 'Archive', 'Delete']) {
			const box = (await detail.getByRole('button', { name, exact: true }).boundingBox())!;
			expect(box.y).toBeGreaterThanOrEqual(0);
			expect(box.y + box.height).toBeLessThanOrEqual(size.height);
		}
		await page.screenshot({ path: test.info().outputPath(`details-${size.width}.png`) });

		// The title wraps (no cut) and reads as text until clicked.
		const field = detail.getByLabel('Link title');
		await expect(field).toHaveValue(long);
		const metrics = await field.evaluate((el) => ({
			height: el.getBoundingClientRect().height,
			fits: el.scrollHeight <= el.clientHeight + 1,
			border: getComputedStyle(el).borderTopColor
		}));
		expect(metrics.height).toBeGreaterThan(40);
		expect(metrics.fits).toBe(true);
		expect(metrics.border).toBe('rgba(0, 0, 0, 0)');
		await field.click();
		await expect
			.poll(() => field.evaluate((el) => getComputedStyle(el).borderTopColor))
			.toBe(await tokenColor(page, '--text'));
		// Esc puts the title back and keeps the details open; Enter saves.
		await field.fill('Changed my mind');
		await page.keyboard.press('Escape');
		await expect(field).toHaveValue(long);
		await expect(detail).toBeVisible();
		await field.click();
		await field.fill('A shorter title');
		await page.keyboard.press('Enter');
		await expect.poll(async () => (await linkById(page, link.id)).title).toBe('A shorter title');

		// Source and Media are property rows: label, then the value.
		for (const name of ['Source', 'Media']) {
			const select = detail.getByRole('combobox', { name });
			const label = detail
				.locator('.prop', { has: page.getByRole('combobox', { name }) })
				.locator('.k');
			const l = (await label.boundingBox())!;
			const v = (await select.boundingBox())!;
			expect(v.x).toBeGreaterThan(l.x + 80);
			expect(Math.abs(v.y + v.height / 2 - (l.y + l.height / 2))).toBeLessThan(6);
		}
		// Description and Notes have no border until focused.
		const notes = detail.getByPlaceholder('Your own thoughts');
		expect(await notes.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(
			'rgba(0, 0, 0, 0)'
		);
		await notes.focus();
		await expect
			.poll(() => notes.evaluate((el) => getComputedStyle(el).borderTopColor))
			.toBe(await tokenColor(page, '--text'));
	});
}

test('a click on a row’s time opens the details and never archives', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const link = await save(page, 'https://timeclick.example.com/one', { title: 'Click my time' });
	await ready(page, '/');
	const r = row(page, 'timeclick.example.com');
	await r.hover();
	await r.locator('time').click();
	await expect(page.getByRole('complementary', { name: 'Link details' })).toBeVisible();
	await page.waitForTimeout(300);
	expect((await linkById(page, link.id)).archivedAt).toBeNull();
	await expect(r).toHaveCount(1);
	// The actions have a slot of their own, after the time.
	const time = (await r.locator('time').boundingBox())!;
	const act = (await r.locator('.c-act').boundingBox())!;
	expect(act.x).toBeGreaterThanOrEqual(time.x + time.width);
});

test('day names sit above their card, a selected row has an accent bar, the sidebar counts only Unsorted', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await save(page, 'https://frame.example.com/one', { title: 'Frame one' });
	await save(page, 'https://frame.example.com/two', { title: 'Frame two' });
	await ready(page, '/');
	// The day's name is on the ground: no card behind it, and the card starts below it.
	const heading = page.locator('li.day-h').first();
	expect(await heading.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
		'rgba(0, 0, 0, 0)'
	);
	const h = (await heading.boundingBox())!;
	const first = (await page.locator('li.row').first().boundingBox())!;
	expect(first.y).toBeGreaterThanOrEqual(h.y + h.height);

	// Selected: a 2 px accent bar inside the left edge; the open row has the fill alone.
	await page.getByRole('button', { name: 'Select', exact: true }).click();
	const one = row(page, 'frame.example.com', '/one');
	await one.getByRole('checkbox').check();
	const accent = await tokenColor(page, '--accent');
	await expect
		.poll(() => one.evaluate((el) => getComputedStyle(el).boxShadow))
		.toContain('2px 0px 0px');
	expect(await one.evaluate((el) => getComputedStyle(el).boxShadow)).toContain(accent);
	await page.getByRole('button', { name: 'Cancel' }).click();
	const two = row(page, 'frame.example.com', '/two');
	await two.locator('time').click();
	await expect(two).toHaveClass(/open/);
	expect(await two.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none');

	// Only Unsorted keeps a count in the sidebar.
	const lists = page.getByRole('navigation', { name: 'Lists' });
	await expect(lists.getByRole('link', { name: /Unsorted/ }).locator('.n')).toHaveCount(1);
	await expect(lists.getByRole('link', { name: /Tags/ }).locator('.n')).toHaveCount(0);
	await expect(page.getByRole('navigation', { name: 'Projects' }).locator('.n')).toHaveCount(0);
});

test('in dark mode a favicon sits on a pale tile; in light the tile is invisible', async ({
	browser
}) => {
	for (const colorScheme of ['dark', 'light'] as const) {
		const context = await browser.newContext({
			baseURL: origin,
			storageState: state,
			colorScheme,
			viewport: { width: 1440, height: 900 }
		});
		const page = await context.newPage();
		await save(page, `https://tile${colorScheme}.example.com/one`, { title: 'Tile' });
		await ready(page, '/');
		const tile = row(page, `tile${colorScheme}.example.com`).locator('.icon-tile');
		expect(await tile.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
			colorScheme === 'dark' ? 'rgb(228, 229, 232)' : 'rgba(0, 0, 0, 0)'
		);
		await page.screenshot({ path: test.info().outputPath(`tile-${colorScheme}-1440.png`) });
		await context.close();
	}
});

test('a tag or project with no links, a search with no match and an empty Unsorted say so in plain words', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const tag = await makeTag(page, 'empty-tag');
	const project = await makeProject(page, 'Empty project');
	await ready(page, `/tags/${tag.id}`);
	await expect(page.locator('.empty')).toContainText(
		'No links carry this tag yet. Paste a link on this page and it is tagged as it is saved.'
	);
	await ready(page, `/projects/${project.id}`);
	await expect(page.locator('.empty')).toContainText(
		'No links in this project yet. Paste a link on this page and it joins the project.'
	);
	await ready(page, '/?q=nothingmatchesthisatall');
	await expect(page.locator('.empty')).toContainText('Nothing matches “nothingmatchesthisatall”.');

	// Empty Unsorted: give every link waiting there a tag (late in the run; no later test needs an empty or a full one).
	const sorted = await makeTag(page, 'sorted-for-empty');
	const waiting = (await (await page.request.get('/api/links?view=unsorted')).json())
		.links as Link[];
	for (const l of waiting)
		await page.request.patch(`/api/links/${l.id}`, { data: { tagIds: [sorted.id] } });
	await ready(page, '/unsorted');
	await expect(page.locator('.empty')).toContainText(
		'Nothing waiting. Every link has a tag or a project'
	);
	await expect(
		page
			.getByRole('navigation', { name: 'Lists' })
			.getByRole('link', { name: /Unsorted/ })
			.locator('.n')
	).toHaveCount(0);
	await page.screenshot({ path: test.info().outputPath('empty-unsorted-1440.png') });
});

test('on a phone a bottom tab bar moves between lists, More holds the menu, and the details rise as a sheet', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await save(page, 'https://phone.example.com/one', { title: 'On the phone' });
	await ready(page, '/');
	const tabs = page.getByRole('navigation', { name: 'Tabs' });
	await expect(tabs).toBeVisible();
	await expect(tabs.getByRole('link')).toHaveText([/Links/, /Unsorted/, /Projects/, /Tags/]);
	await expect(tabs.getByRole('button', { name: 'More' })).toBeVisible();
	// The bar sits at the foot of the screen; the top bar keeps no menu button.
	const bar = (await tabs.boundingBox())!;
	expect(Math.round(bar.y + bar.height)).toBe(844);
	await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
	await page.screenshot({ path: test.info().outputPath('phone-list-390.png') });

	for (const [name, path] of [
		['Unsorted', '/unsorted'],
		['Projects', '/projects'],
		['Tags', '/tags'],
		['Links', '/']
	]) {
		await tabs.getByRole('link', { name: new RegExp(name) }).click();
		await expect(page).toHaveURL(`${origin}${path}`);
		await expect(tabs.getByRole('link', { name: new RegExp(name) })).toHaveAttribute(
			'aria-current',
			'page'
		);
	}
	// Unsorted's tab carries its count when links wait there.
	await save(page, 'https://phone.example.com/waiting', { title: 'Waiting' });
	await ready(page, '/');
	const count = (await (await page.request.get('/api/links')).json()).counts.unsorted;
	expect(count).toBeGreaterThan(0);
	await expect(tabs.getByRole('link', { name: /Unsorted/ }).locator('.badge')).toHaveText(
		String(count)
	);

	// More opens the menu: Archive, Settings, Log out.
	await tabs.getByRole('button', { name: 'More' }).click();
	const menu = page.getByRole('dialog', { name: 'Menu' });
	await expect(menu.getByRole('link', { name: 'Archive' })).toBeVisible();
	await expect(menu.getByRole('link', { name: 'Settings' })).toBeVisible();
	await expect(menu.getByRole('button', { name: 'Log out' })).toBeVisible();
	await menu.getByRole('link', { name: 'Archive' }).click();
	await expect(page).toHaveURL(`${origin}/archive`);

	// The details rise as a sheet with a grab handle.
	await ready(page, '/');
	await row(page, 'phone.example.com', '/one').locator('time').click();
	const detail = page.getByRole('complementary', { name: 'Link details' });
	await expect(detail).toBeVisible();
	await expect(detail.locator('.grab')).toBeVisible();
	await page.waitForTimeout(500);
	const sheet = (await detail.boundingBox())!;
	expect(sheet.y).toBeGreaterThan(0);
	expect(Math.round(sheet.y + sheet.height)).toBe(844);
	await page.screenshot({ path: test.info().outputPath('phone-sheet-390.png') });
});
