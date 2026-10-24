import { ORIGIN } from '$app/env/private';
import { db, syncWrite } from '../db/index.ts';
import { mediaDir } from './paths.ts';
import { createFetchQueue } from './queue.ts';
import { markFailed, refreshLink, type FetchDeps } from './refresh.ts';
import { createSafeFetch, linkSinkUserAgent } from './safe.ts';

/** The app's fetch queue, on the app's database, with the one guarded fetch and LinkSink's own User-Agent. */
export function createAppQueue() {
	const host = URL.parse(ORIGIN ?? '')?.host || 'localhost';
	const deps: FetchDeps = {
		db,
		syncWrite,
		safeFetch: createSafeFetch({ userAgent: linkSinkUserAgent(host) }),
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
