import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuth, SIGN_UP_CLOSED, type Auth } from './auth-config.ts';
import { account, session, user } from './db/schema.ts';
import type { Mail, Mailer } from './mail.ts';
import { tempDatabase } from './test/db.ts';

let t: ReturnType<typeof tempDatabase>;
let auth: Auth;
let sent: Mail[];

const email = 'person@example.com';
const password = 'correct horse battery staple';

beforeEach(() => {
	t = tempDatabase();
	sent = [];
	const mailer: Mailer = { send: async (m) => void sent.push(m) };
	auth = createAuth({
		db: t.db,
		secret: 'unit-test-secret-unit-test-secret-0123',
		baseURL: 'http://localhost:3000',
		mailer
	});
});
afterEach(() => t.close());

const signUp = (e = email) => auth.api.signUpEmail({ body: { email: e, password, name: e } });

async function verifyAndSignIn() {
	const token = new URL(sent[0].text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;
	await auth.api.verifyEmail({ query: { token } });
	return auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
}

describe('accounts', () => {
	it('hashes passwords with argon2id, 19 MiB, t=2, p=1', async () => {
		await signUp();
		const [u] = t.db.select().from(user).all();
		const [acc] = t.db.select().from(account).where(eq(account.userId, u.id)).all();
		expect(acc.password).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
	});

	it('sends a verification mail on sign-up and refuses login until the email is confirmed', async () => {
		await signUp();
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe(email);
		await expect(auth.api.signInEmail({ body: { email, password } })).rejects.toMatchObject({
			statusCode: 403
		});
		const res = await verifyAndSignIn();
		expect(res.response.user.email).toBe(email);
		expect(t.db.select().from(user).get()?.emailVerified).toBe(true);
	});

	it('refuses a second sign-up once one account exists', async () => {
		await signUp();
		const second = signUp('someone.else@example.com');
		await expect(second).rejects.toBeInstanceOf(APIError);
		await expect(signUp('third@example.com')).rejects.toMatchObject({
			statusCode: 403,
			message: SIGN_UP_CLOSED
		});
		expect(t.db.select().from(user).all()).toHaveLength(1);
		expect(sent).toHaveLength(1);
	});

	it('keeps no session cookie cache, so a revoked session stops at once', async () => {
		expect(auth.options.session?.cookieCache?.enabled).toBe(false);
		await signUp();
		const res = await verifyAndSignIn();
		const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]);
		expect(cookie.some((c) => c.startsWith('better-auth.session_data'))).toBe(false);
		const headers = new Headers({ cookie: cookie.join('; ') });
		expect((await auth.api.getSession({ headers }))?.user.email).toBe(email);

		t.db.delete(session).run(); // the session is revoked
		expect(await auth.api.getSession({ headers })).toBeNull();
	});

	it('issues a bearer token that authenticates on its own (for the iOS app and scripts)', async () => {
		await signUp();
		const res = await verifyAndSignIn();
		const token = res.headers.get('set-auth-token');
		expect(token).toBeTruthy();
		const headers = new Headers({ authorization: `Bearer ${token}` });
		expect((await auth.api.getSession({ headers }))?.user.email).toBe(email);
	});
});
