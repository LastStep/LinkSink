import { DATABASE_PATH } from '$app/env/private';
import { building } from '$app/env';
import { openDatabase, type DB } from './open.ts';
import { createSyncWrite } from '../sync/write.ts';

// Not opened while SvelteKit analyses the build, so a build never creates or migrates a database.
export const db: DB = building ? (null as unknown as DB) : openDatabase(DATABASE_PATH);

/** The app's one versioned write path for synced tables (ADR-0001). */
export const syncWrite = createSyncWrite(db);
