// Only for `npm run auth:schema`: the auth CLI reads this file to generate src/lib/server/db/auth.schema.ts.
// It builds the same options as the app on a throwaway in-memory database, with no SvelteKit imports.
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { createAuth } from './auth-config.ts';
import { consoleMailer } from './mail.ts';
import type { DB } from './db/open.ts';

export const auth = createAuth({
	db: drizzle(new Database(':memory:')) as unknown as DB,
	secret: 'auth-cli-schema-generation-only-not-a-secret',
	baseURL: 'http://localhost',
	mailer: consoleMailer()
});
