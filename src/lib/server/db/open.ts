import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.ts';

export type DB = ReturnType<typeof openDatabase>;

/**
 * Opens the SQLite file (or `:memory:`) in WAL mode with foreign keys on, and applies the migrations in drizzle/.
 * Free of SvelteKit imports so tests and scripts can open their own database.
 */
export function openDatabase(path: string, migrationsFolder = resolve('drizzle')) {
	if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
	const client = new Database(path);
	client.pragma('journal_mode = WAL');
	client.pragma('foreign_keys = ON');
	client.pragma('busy_timeout = 5000');
	client.pragma('synchronous = NORMAL');
	const db = drizzle(client, { schema });
	migrate(db, { migrationsFolder });
	return db;
}
