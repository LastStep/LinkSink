import { db, syncWrite } from '../db/index.ts';
import { enqueueFetch } from '../fetch/queue.ts';
import { createLinksApi } from './links.ts';

/** The app's links API, on the app's database. */
export const linksApi = createLinksApi({ db, syncWrite, onCreated: enqueueFetch });
