import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../db/open.ts';
import { user } from '../db/schema.ts';

/** A fresh migrated database in a temporary folder; `close()` removes it. */
export function tempDatabase() {
	const dir = mkdtempSync(join(tmpdir(), 'linksink-test-'));
	const db = openDatabase(join(dir, 'test.db'));
	return {
		db,
		close() {
			db.$client.close();
			rmSync(dir, { recursive: true, force: true });
		}
	};
}

export function addUser(db: ReturnType<typeof openDatabase>, id: string) {
	db.insert(user)
		.values({ id, name: id, email: `${id}@example.com`, emailVerified: true })
		.run();
	return id;
}
