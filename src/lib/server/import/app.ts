import { db, syncWrite } from '../db/index.ts';
import { kickFetches } from '../fetch/queue.ts';
import { createImportApi } from './api.ts';

/** The app's import and export endpoints, on the app's database; new links' details are fetched in the background,
 * read from the database by the fetch queue's feeder. */
export const importApi = createImportApi({ db, syncWrite, onImported: kickFetches });
