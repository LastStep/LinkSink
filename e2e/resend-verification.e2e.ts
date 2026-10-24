import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { linkIn, sentMail } from './outbox.ts';

const email = 'resend@example.com';
const password = 'correct horse battery staple';

test.describe.configure({ mode: 'serial' });

// LinkSink has one account and the other e2e files sign up their own: this file runs first (by name) and removes its
// account when done, then waits out the rate-limit window so the next file's log-ins are not counted against it.
test.afterAll(async () => {
	const db = new Database(resolve('data/e2e/e2e.db'));
	try {
		db.prepare('DELETE FROM session').run();
		db.prepare('DELETE FROM account').run();
		db.prepare('DELETE FROM verification').run();
		db.prepare('DELETE FROM user').run();
	} finally {
		db.close();
	}
	await new Promise((r) => setTimeout(r, 11_000));
});

const mailCount = () => sentMail().filter((m) => m.to === email).length;

test('an unconfirmed account gets a new link on a correct password, and nothing on a wrong one', async ({
	page
}) => {
	await page.goto('/signup');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign up' }).click();
	await expect(page.getByRole('status')).toContainText(`We sent a link to ${email}`);
	expect(mailCount()).toBe(1);

	await page.goto('/login');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('not the right password');
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('alert')).toBeVisible();
	expect(mailCount()).toBe(1);

	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('status')).toContainText(`We sent a new link to ${email}`);
	await expect.poll(mailCount).toBe(2);
});

test('repeated log-in tries do not flood the inbox: the sign-in rate limit answers 429', async ({
	request
}) => {
	await new Promise((r) => setTimeout(r, 11_000)); // let the 10 s window of the first test pass
	const before = mailCount();
	const statuses: number[] = [];
	for (let i = 0; i < 8; i++) {
		const res = await request.post('/api/auth/sign-in/email', {
			data: { email, password },
			headers: { origin: 'http://127.0.0.1:4173' }
		});
		statuses.push(res.status());
	}
	expect(statuses).toContain(429);
	expect(statuses.filter((s) => s === 403)).toHaveLength(3);
	await expect.poll(() => mailCount() - before).toBe(3);
});

test('the new link confirms the account and login then works', async ({ page }) => {
	await new Promise((r) => setTimeout(r, 11_000));
	const mails = sentMail().filter((m) => m.to === email);
	await page.goto(linkIn(mails[mails.length - 1]));
	await expect(page).toHaveURL(/\/login\?verified=1$/);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page).toHaveURL(/\/$/);
});
