import { MAIL_TRANSPORT, ORIGIN, TEST_ONLY_FETCH_ALLOW } from '$app/env/private';
import { db, syncWrite } from '../db/index.ts';
import { parseTestFetchAllow } from './allow.ts';
import { mediaDir } from './paths.ts';
import { createFetchQueue } from './queue.ts';
import { markFailed, refreshLink, type FetchDeps } from './refresh.ts';
import { createSafeFetch, linkSinkUserAgent } from './safe.ts';

async function refuseEveryName(host: string): Promise<string[]> {
	throw new Error(`the e2e server fetches only its fixture site, not ${host}`);
}

/** The app's fetch queue, on the app's database, with the one guarded fetch and LinkSink's own User-Agent. */
export function createAppQueue() {
	const host = URL.parse(ORIGIN ?? '')?.host || 'localhost';
	const allow = parseTestFetchAllow(TEST_ONLY_FETCH_ALLOW, MAIL_TRANSPORT);
	const deps: FetchDeps = {
		db,
		syncWrite,
		safeFetch: createSafeFetch({
			userAgent: linkSinkUserAgent(host),
			allow,
			// The e2e server reaches its fixture site and nothing else: no name is looked up, so no test fetches
			// the internet (links saved there to example.org and the like end as failed, titled by their host).
			...(allow ? { resolve: refuseEveryName } : {})
		}),
		mediaDir: mediaDir()
	};
	return createFetchQueue({
		work: (id) => refreshLink(deps, id),
		onGiveUp: (id, error) => {
			console.warn(
				'[fetch] details not fetched',
				id,
				error instanceof Error ? error.message : error
			);
			markFailed(deps, id);
		}
	});
}
