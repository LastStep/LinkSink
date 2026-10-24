import { expect, test } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

const email = 'person@example.com';
const password = 'correct horse battery staple';

test.describe.configure({ mode: 'serial' });

test('sign up, confirm the email, log in, save links and search them', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login$/);

	await page.goto('/signup');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign up' }).click();
	await expect(page.getByRole('status')).toContainText(`We sent a link to ${email}`);

	// Logging in before the email is confirmed is refused.
	await page.goto('/login');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('alert')).toContainText(/not verified/i);

	const mail = sentMail().filter((m) => m.to === email);
	// The sign-up mail, then the fresh one the refused log-in sent (T-0014).
	expect(mail).toHaveLength(2);
	expect(mail.map((m) => m.subject)).toEqual(Array(2).fill('Confirm your LinkSink email'));
	await page.goto(linkIn(mail[0]));
	await expect(page).toHaveURL(/\/login\?verified=1$/);
	await expect(page.getByRole('status')).toContainText('Your email is confirmed');

	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('heading', { name: 'Links' })).toBeVisible();
	await expect(page.getByText('No links yet')).toBeVisible();

	const save = async (url: string, title: string) => {
		await page.getByLabel('Link', { exact: true }).fill(url);
		await page.getByLabel('Title').fill(title);
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByRole('link', { name: title })).toBeVisible();
	};
	await save('https://svelte.dev/docs/svelte/what-are-runes', 'Svelte runes explained');
	await save('https://orm.drizzle.team/docs/migrations', 'Drizzle migrations guide');
	await expect(page.getByRole('list', { name: 'Links' }).getByRole('listitem')).toHaveCount(2);

	// FTS5 prefix search: "run" finds "runes" and not the Drizzle link.
	await page.getByRole('searchbox', { name: 'Search' }).fill('run');
	await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
	await expect(page).toHaveURL(/\?q=run$/);
	const rows = page.getByRole('list', { name: 'Links' }).getByRole('listitem');
	await expect(rows).toHaveCount(1);
	await expect(rows.first()).toContainText('Svelte runes explained');

	await page.goto('/?q=migrat');
	await expect(rows).toHaveCount(1);
	await expect(rows.first()).toContainText('Drizzle migrations guide');

	await page.goto('/?q=nothinglikethis');
	await expect(page.getByText('Nothing matches')).toBeVisible();

	await page.getByRole('button', { name: 'Log out' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await page.goto('/');
	await expect(page).toHaveURL(/\/login$/);
});

test('a second sign-up is refused once the account exists', async ({ page, request }) => {
	await page.goto('/signup');
	await expect(page.getByText('This LinkSink already has its account')).toBeVisible();
	await page.getByLabel('Email').fill('someone.else@example.com');
	await page.getByLabel('Password').fill('another long password');
	await page.getByRole('button', { name: 'Sign up' }).click();
	await expect(page.getByRole('alert')).toContainText('Sign-up is closed');

	// The same through Better Auth's own endpoint, as a script or the iOS app would call it.
	const res = await request.post('/api/auth/sign-up/email', {
		headers: { Origin: 'http://127.0.0.1:4173' },
		data: { email: 'third@example.com', password: 'yet another password', name: 'x' }
	});
	expect(res.status()).toBe(403);
	expect(await res.text()).toContain('Sign-up is closed');
	expect(sentMail().map((m) => m.to)).toEqual(['person@example.com']);
});

test('the login form is rate-limited like the API: wrong passwords soon get "too many tries"', async ({
	page
}) => {
	await page.goto('/login');
	const statuses: number[] = [];
	for (let i = 0; i < 5 && !statuses.includes(429); i++) {
		await page.getByLabel('Email').fill(email);
		await page.getByLabel('Password').fill('not the password at all');
		const [res] = await Promise.all([
			page.waitForResponse(
				(r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/login'
			),
			page.getByRole('button', { name: 'Log in' }).click()
		]);
		statuses.push(res.status());
	}
	// Better Auth allows 3 sign-in tries per 10 s per client; the first test's two log-ins count too.
	expect(statuses.at(-1)).toBe(429);
	expect(statuses.slice(0, -1).every((s) => s === 401)).toBe(true);
	await expect(page.getByRole('alert')).toContainText('Too many tries');

	// While limited, even the right password is refused.
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole('alert')).toContainText('Too many tries');
});
