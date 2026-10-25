import { db, syncWrite } from '../db/index.ts';
import { enqueueFetch } from '../fetch/queue.ts';
import { createImportApi } from './api.ts';

/** The app's import and export endpoints, on the app's database; new links' details are fetched in the background. */
export const importApi = createImportApi({ db, syncWrite, onCreated: enqueueFetch });
