import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

// LinkSink's mark is the app's icon on every page (T-0028). Runs on the shared e2e server (one worker, name order);
// makes the account itself when run alone.
const port = Number(process.env.E2E_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const email = 'person@example.com';
const password = 'correct horse battery staple';
const state = 'data/e2e/t0028-session.json';

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

type Icon = { rel: string; href: string; type: string | null; sizes: string | null };

/** The head's icon links, as the page has them. */
const iconLinks = (page: Page) =>
	page.evaluate(() =>
		[...document.querySelectorAll('head link[rel~="icon"], head link[rel="apple-touch-icon"]')].map(
			(el) => ({
				rel: el.getAttribute('rel')!,
				href: (el as HTMLLinkElement).href,
				type: el.getAttribute('type'),
				sizes: el.getAttribute('sizes')
			})
		)
	);

/** Width and height from a PNG's header. */
const pngSize = (bytes: Buffer) => ({ w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) });

async function expectIcons(page: Page, path: string) {
	await page.goto(path);
	const icons: Icon[] = await iconLinks(page);
	const by = (rel: string, type?: string) =>
		icons.find((i) => i.rel === rel && (type === undefined || i.type === type));
	const svg = by('icon', 'image/svg+xml');
	expect(svg?.href, `${path}: the SVG icon is a file`).toMatch(/\/favicon\.svg$/);
	const small = by('icon', 'image/png');
	const touch = by('apple-touch-icon');
	expect(svg, `${path}: an SVG icon link`).toBeTruthy();
	expect(small?.sizes, `${path}: a 32 px PNG icon link`).toBe('32x32');
	expect(touch?.sizes, `${path}: an apple-touch-icon link`).toBe('180x180');

	const get = async (href: string) => {
		const res = await page.request.get(href);
		expect(res.status(), href).toBe(200);
		return res;
	};
	const svgRes = await get(svg!.href);
	expect(svgRes.headers()['content-type']).toContain('image/svg+xml');
	const text = await svgRes.text();
	expect(text).toContain('<title>LinkSink</title>');
	expect(text).toContain('M3 11h18a9 9 0 0 1-18 0Z'); // the mark's bowl, as in Mark.svelte
	expect(text).not.toMatch(/svelte/i);
	// Legible in a dark browser theme too
	expect(text).toContain('prefers-color-scheme:dark');

	for (const [icon, side] of [
		[small!, 32],
		[touch!, 180]
	] as const) {
		const res = await get(icon.href);
		expect(res.headers()['content-type']).toContain('image/png');
		expect(pngSize(await res.body())).toEqual({ w: side, h: side });
	}
}

test('every page links the mark: the signed-in screens and the sign-in and sign-up pages', async ({
	page,
	browser
}) => {
	for (const path of ['/', '/unsorted', '/archive', '/projects', '/tags', '/settings'])
		await expectIcons(page, path);

	// Signed out
	const context = await browser.newContext({
		baseURL: origin,
		storageState: { cookies: [], origins: [] }
	});
	const out = await context.newPage();
	await expectIcons(out, '/login');
	await expectIcons(out, '/signup');
	await context.close();
});

test('the mark is the one the sidebar draws, in the tab icon: a light and a dark browser theme', async ({
	browser
}) => {
	for (const colorScheme of ['light', 'dark'] as const) {
		const context = await browser.newContext({ baseURL: origin, colorScheme, storageState: state });
		const page = await context.newPage();
		await page.goto('/');
		const href = (await iconLinks(page)).find((i) => i.type === 'image/svg+xml')!.href;
		const source = await (await page.request.get(href)).text();
		const dataUrl = `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`;
		// Draw the icon file itself as a page would draw an image, on the browser's own background
		await page.goto('about:blank');
		await page.setViewportSize({ width: 200, height: 120 });
		await page.setContent(
			`<body style="margin:0;display:grid;place-items:center;height:120px;background:${colorScheme === 'dark' ? '#202124' : '#ffffff'}"><img id="i" width="64" src="${dataUrl}"></body>`
		);
		await page.locator('#i').evaluate((img: HTMLImageElement) => img.decode());
		const ink = await page.locator('#i').evaluate(async (img: HTMLImageElement) => {
			const c = document.createElement('canvas');
			c.width = c.height = 64;
			const g = c.getContext('2d')!;
			g.drawImage(img, 0, 0, 64, 64);
			const d = g.getImageData(0, 0, 64, 64).data;
			let r = 0,
				n = 0;
			for (let i = 0; i < d.length; i += 4)
				if (d[i + 3] > 200) {
					r += d[i];
					n++;
				}
			return { pixels: n, red: n ? r / n : -1 };
		});
		expect(ink.pixels).toBeGreaterThan(200);
		// Dark ink on a light theme, white on a dark one
		if (colorScheme === 'dark') expect(ink.red).toBeGreaterThan(200);
		else expect(ink.red).toBeLessThan(50);
		await page.screenshot({ path: test.info().outputPath(`tab-icon-${colorScheme}.png`) });
		await context.close();
	}
});
