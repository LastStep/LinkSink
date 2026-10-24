import type { BetterAuthPlugin } from 'better-auth';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { bearer } from 'better-auth/plugins';
import { count } from 'drizzle-orm';
import type { DB } from './db/open.ts';
import { user } from './db/schema.ts';
import * as schema from './db/schema.ts';
import type { Mailer } from './mail.ts';
import { hashPassword, verifyPassword } from './password.ts';

export const SIGN_UP_CLOSED = 'Sign-up is closed: this LinkSink already has its one account.';

export interface AuthDeps {
	db: DB;
	secret: string;
	baseURL: string;
	mailer: Mailer;
	/** Extra plugins after ours; `sveltekitCookies` goes here, since it must be last. */
	plugins?: BetterAuthPlugin[];
}

/** True once the one account exists: LinkSink is single-user, so sign-up closes after it. */
export function hasAccount(db: DB) {
	const [row] = db.select({ n: count() }).from(user).all();
	return (row?.n ?? 0) > 0;
}

/** Builds the Better Auth instance. Free of SvelteKit imports so unit tests can build one on their own database. */
export function createAuth({ db, secret, baseURL, mailer, plugins = [] }: AuthDeps) {
	return betterAuth({
		baseURL,
		secret,
		database: drizzleAdapter(db, { provider: 'sqlite', schema }),
		telemetry: { enabled: false },
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			autoSignIn: false,
			minPasswordLength: 10,
			password: { hash: hashPassword, verify: verifyPassword },
			sendResetPassword: async ({ user, url }) => {
				await mailer.send({
					to: user.email,
					subject: 'Reset your LinkSink password',
					text: `Open this link to choose a new password:\n${url}\n\nIf you did not ask for this, ignore this mail.`
				});
			}
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: false,
			sendVerificationEmail: async ({ user, url }) => {
				await mailer.send({
					to: user.email,
					subject: 'Confirm your LinkSink email',
					text: `Open this link to confirm your email:\n${url}`
				});
			}
		},
		// No cookie cache: every request reads the session row, so a revoked session stops at once.
		session: { cookieCache: { enabled: false } },
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path === '/sign-up/email' && hasAccount(db)) {
					throw new APIError('FORBIDDEN', { message: SIGN_UP_CLOSED });
				}
			})
		},
		databaseHooks: {
			user: {
				create: {
					// A second line behind the hook above, for any other path that could create a user.
					before: async () => {
						if (hasAccount(db)) throw new APIError('FORBIDDEN', { message: SIGN_UP_CLOSED });
					}
				}
			}
		},
		plugins: [bearer(), ...plugins]
	});
}

export type Auth = ReturnType<typeof createAuth>;
