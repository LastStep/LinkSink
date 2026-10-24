import { describe, expect, it } from 'vitest';
import { createFetchQueue } from './queue.ts';
import { FetchRefused } from './safe.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('createFetchQueue', () => {
	it('runs at most two at a time', async () => {
		let now = 0;
		let most = 0;
		const done: string[] = [];
		const queue = createFetchQueue({
			work: async (id) => {
				now++;
				most = Math.max(most, now);
				await sleep(15);
				now--;
				done.push(id);
			},
			onGiveUp: () => {}
		});
		for (const id of ['a', 'b', 'c', 'd', 'e']) queue.enqueue(id);
		expect(queue.pending).toBe(5);
		await queue.idle();
		expect(most).toBe(2);
		expect(done.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
		expect(queue.pending).toBe(0);
	});

	it('retries a failure once, then succeeds without giving up', async () => {
		const tries: string[] = [];
		const gaveUp: string[] = [];
		const queue = createFetchQueue({
			work: async (id) => {
				tries.push(id);
				if (tries.length === 1) throw new Error('ECONNRESET');
			},
			onGiveUp: (id) => void gaveUp.push(id),
			retryDelayMs: 5
		});
		queue.enqueue('a');
		await queue.idle();
		expect(tries).toEqual(['a', 'a']);
		expect(gaveUp).toEqual([]);
	});

	it('gives up after the retry fails too', async () => {
		let tries = 0;
		const gaveUp: unknown[] = [];
		const queue = createFetchQueue({
			work: async () => {
				tries++;
				throw new Error(`try ${tries}`);
			},
			onGiveUp: (_id, error) => void gaveUp.push((error as Error).message),
			retryDelayMs: 5
		});
		queue.enqueue('a');
		await queue.idle();
		expect(tries).toBe(2);
		expect(gaveUp).toEqual(['try 2']);
	});

	it('never retries a refused URL', async () => {
		let tries = 0;
		const gaveUp: string[] = [];
		const queue = createFetchQueue({
			work: async () => {
				tries++;
				throw new FetchRefused('address', 'not public');
			},
			onGiveUp: (id) => void gaveUp.push(id),
			retryDelayMs: 5
		});
		queue.enqueue('a');
		await queue.idle();
		expect(tries).toBe(1);
		expect(gaveUp).toEqual(['a']);
	});

	it('a link queued twice while waiting runs once; queued while running runs again after', async () => {
		const runs: string[] = [];
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const queue = createFetchQueue({
			concurrency: 1,
			work: async (id) => {
				runs.push(id);
				if (runs.length === 1) await gate;
			},
			onGiveUp: () => {}
		});
		queue.enqueue('a'); // running, held at the gate
		queue.enqueue('b'); // waiting
		queue.enqueue('b'); // still waiting: ignored
		queue.enqueue('a'); // running: run again after
		release();
		await queue.idle();
		expect(runs.sort()).toEqual(['a', 'a', 'b']);
	});

	it('a failure to record a failure is logged, not thrown', async () => {
		const logged: unknown[] = [];
		const queue = createFetchQueue({
			work: async () => {
				throw new FetchRefused('address', 'no');
			},
			onGiveUp: () => {
				throw new Error('database locked');
			},
			log: (...args) => void logged.push(args),
			retryDelayMs: 5
		});
		queue.enqueue('a');
		await queue.idle();
		expect(logged).toHaveLength(1);
	});
});
