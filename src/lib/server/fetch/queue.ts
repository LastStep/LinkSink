import { FetchRefused } from './safe.ts';

/**
 * The in-process fetch queue: after a link is saved, its details are fetched in the background, two at a time, each
 * retried once (a refused URL is never retried). When both tries fail, `onGiveUp` records the failure.
 */
export interface QueueOptions {
	/** Fetches and writes one link's details; throws on failure. */
	work: (linkId: string) => Promise<unknown>;
	/** Called once a link has failed every try. */
	onGiveUp: (linkId: string, error: unknown) => void | Promise<void>;
	concurrency?: number;
	/** Tries after the first. */
	retries?: number;
	retryDelayMs?: number;
	log?: (...args: unknown[]) => void;
}

export interface FetchQueue {
	enqueue(linkId: string): void;
	/** Resolves once nothing is queued, waiting or running. */
	idle(): Promise<void>;
	readonly pending: number;
}

export function createFetchQueue(options: QueueOptions): FetchQueue {
	const concurrency = options.concurrency ?? 2;
	const retries = options.retries ?? 1;
	const retryDelayMs = options.retryDelayMs ?? 2_000;
	const log = options.log ?? console.error;

	const waiting: { id: string; attempt: number }[] = [];
	const queued = new Set<string>(); // waiting, delayed for a retry, or running
	const active = new Set<string>(); // running now
	const again = new Set<string>(); // enqueued again while running: run once more after
	let running = 0;
	let delayed = 0;
	let idleWaiters: (() => void)[] = [];

	function settle() {
		if (running === 0 && delayed === 0 && waiting.length === 0) {
			const waiters = idleWaiters;
			idleWaiters = [];
			for (const resolve of waiters) resolve();
		}
	}

	function pump() {
		while (running < concurrency && waiting.length) {
			const job = waiting.shift()!;
			running++;
			active.add(job.id);
			void run(job);
		}
		settle();
	}

	async function run(job: { id: string; attempt: number }) {
		try {
			await options.work(job.id);
			finish(job.id);
		} catch (error) {
			if (!(error instanceof FetchRefused) && job.attempt < retries) {
				delayed++;
				setTimeout(() => {
					delayed--;
					waiting.push({ id: job.id, attempt: job.attempt + 1 });
					pump();
				}, retryDelayMs);
			} else {
				try {
					await options.onGiveUp(job.id, error);
				} catch (failure) {
					log('[fetch] could not record a failure', job.id, failure);
				}
				finish(job.id);
			}
		} finally {
			active.delete(job.id);
			running--;
			pump();
		}
	}

	function finish(id: string) {
		queued.delete(id);
		if (again.delete(id)) enqueue(id);
	}

	function enqueue(id: string) {
		if (queued.has(id)) {
			// already waiting: nothing to add; running: its details may be stale by the time it writes, so run again
			if (active.has(id)) again.add(id);
			return;
		}
		queued.add(id);
		waiting.push({ id, attempt: 0 });
		pump();
	}

	return {
		enqueue,
		idle: () =>
			new Promise<void>((resolve) => {
				idleWaiters.push(resolve);
				settle();
			}),
		get pending() {
			return queued.size;
		}
	};
}

let appQueue: Promise<FetchQueue> | null = null;

/**
 * Queues a fetch of the link's page details; returns at once. The save path calls this after its insert. The app's
 * queue (and its database, guarded fetch and image folder) is made on first use.
 */
export function enqueueFetch(linkId: string): void {
	appQueue ??= import('./app.ts').then((m) => m.createAppQueue());
	appQueue.then(
		(queue) => queue.enqueue(linkId),
		(error) => console.error('[fetch] queue unavailable', error)
	);
}
