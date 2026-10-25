// T-0023 (BUG-004): after an import the server fetches page details in the background, a few links at a time, for
// minutes. This asks the existing list endpoint for the library (newest saved first, 200 a page, at most MAX_PAGES
// pages), hands each page to the store so open rows fill in, and counts the links whose `metaState` is still
// 'pending'. It asks again every EVERY_MS (HIDDEN_MS in a hidden tab) until none is waiting, then stops and stays
// quiet until `check()` is called again. T-0010 (sync) replaces all of this with pulls since a cursor: delete this
// file and its few lines in api.ts.
import type { LinkJson } from './types.ts';

export const EVERY_MS = 3_000;
export const HIDDEN_MS = 10_000;
/** 5 pages of 200: a bigger library reads "at least". */
export const MAX_PAGES = 5;
export const PAGE = 200;

export interface DetailsWatchTuning {
	hidden?: () => boolean;
	everyMs?: number;
	hiddenMs?: number;
	maxPages?: number;
}

export interface DetailsWatchOptions extends DetailsWatchTuning {
	/** One page of the library from `after` (null: the first); the answer's cursor is null on the last page. */
	page: (after: string | null) => Promise<{ links: LinkJson[]; next: string | null }>;
	/** Every link of a page, to put into the rows the store holds. */
	onLinks: (links: LinkJson[]) => void;
	/** How many links still wait for their details; `atLeast` when the scan stopped before the last page. */
	onLeft: (left: number, atLeast: boolean) => void;
}

export function createDetailsWatch({
	page,
	onLinks,
	onLeft,
	hidden = () => typeof document !== 'undefined' && document.hidden,
	everyMs = EVERY_MS,
	hiddenMs = HIDDEN_MS,
	maxPages = MAX_PAGES
}: DetailsWatchOptions) {
	let running = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function scan(): Promise<boolean> {
		let left = 0;
		let after: string | null = null;
		let more = false;
		for (let i = 0; i < maxPages; i++) {
			const got = await page(after);
			onLinks(got.links);
			left += got.links.filter((l) => l.metaState === 'pending').length;
			after = got.next;
			if (!after) break;
			more = i === maxPages - 1;
		}
		onLeft(left, more && left > 0);
		return left > 0;
	}

	async function tick(first: boolean) {
		timer = undefined;
		let waiting: boolean;
		try {
			waiting = await scan();
		} catch {
			// A missed scan (offline, a server error): keep asking if details were being waited for, else stop.
			waiting = !first;
		}
		if (waiting) timer = setTimeout(() => void tick(false), hidden() ? hiddenMs : everyMs);
		else running = false;
	}

	return {
		/** Looks once, and keeps looking while any link waits. Does nothing while it is already looking. */
		check() {
			if (running) return;
			running = true;
			void tick(true);
		},
		stop() {
			clearTimeout(timer);
			timer = undefined;
			running = false;
		}
	};
}
