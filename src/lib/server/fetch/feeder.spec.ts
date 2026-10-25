// T-0012 fix round 2 (C1): the fetch queue holds a few links at a time however many wait, reads them from the
// database, and never holds the event loop through a run of fetches that fail at once.
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { links } from '../db/schema.ts';
import { addUser, tempDatabase } from '../test/db.ts';
import { createFeeder, nextPending } from './feeder.ts';
import { createFetchQueue } from './queue.ts';
import { FetchRefused } from './safe.ts';

let t: ReturnType<typeof tempDatabase>;
beforeEach(() => {
	t = tempDatabase();
	addUser(t.db, 'u');
});
afterEach(() => t.close());

/** n links waiting for their details, written straight to the table (ids sort in order). */
function pending(n: number) {
	const insert = t.db.$client.prepare(
		`INSERT INTO links (id, user_id, url, url_key, title, saved_via, created_at, updated_at, version, meta_state)
		 VALUES (?, 'u', ?, ?, 'x', 'import', 1, 1, 1, 'pending')`
	);
	t.db.$client.transaction(() => {
		for (let i = 0; i < n; i++) {
			const id = String(i).padStart(26, '0');
			insert.run(id, `https://p.example.com/${i}`, `p.example.com/${i}`);
		}
	})();
}

describe('the feeder', () => {
	it('keeps at most 11 links in the queue while 100,000 wait, and fetches every one, 2 at a time', async () => {
		pending(100_000);
		const markOk = t.db.$client.prepare(`UPDATE links SET meta_state = 'ok' WHERE id = ?`);
		let most = 0;
		let running = 0;
		let mostRunning = 0;
		let done = 0;
		const queue = createFetchQueue({
			onRoom: () => feeder.fill(),
			work: async (id) => {
				running++;
				mostRunning = Math.max(mostRunning, running);
				await new Promise((r) => setImmediate(r));
				markOk.run(id);
				running--;
				done++;
			},
			onGiveUp: () => {}
		});
		const feeder = createFeeder({
			queue: {
				enqueue: (id) => {
					queue.enqueue(id);
					most = Math.max(most, queue.pending);
				},
				get pending() {
					return queue.pending;
				},
				queuedIds: () => queue.queuedIds()
			},
			next: (after, limit, exclude) => nextPending(t.db, after, limit, exclude)
		});
		feeder.kick();
		await queue.idle();
		expect(done).toBe(100_000);
		expect(most).toBeLessThanOrEqual(11);
		expect(mostRunning).toBe(2);
		const left = t.db.select().from(links).where(eq(links.metaState, 'pending')).all();
		expect(left).toHaveLength(0);
	}, 120_000);

	it('skips links that are queued already, deleted, or not pending; a kick starts from the first again', () => {
		pending(5);
		t.db.$client.exec(`UPDATE links SET meta_state = 'ok' WHERE id = '${'1'.padStart(26, '0')}'`);
		t.db.$client.exec(`UPDATE links SET deleted_at = 1 WHERE id = '${'2'.padStart(26, '0')}'`);
		const ids = (n: number) => String(n).padStart(26, '0');
		expect(nextPending(t.db, '', 10, [ids(3)])).toEqual([ids(0), ids(4)]);
		expect(nextPending(t.db, ids(0), 10, [])).toEqual([ids(3), ids(4)]);
	});
});

describe('the queue and the event loop', () => {
	it('a run of fetches that fail at once lets timers and requests through between jobs', async () => {
		let turns = 0;
		const timer = setInterval(() => turns++, 0);
		const queue = createFetchQueue({
			work: async () => {
				throw new FetchRefused('address', 'refused at once');
			},
			onGiveUp: () => {}
		});
		for (let i = 0; i < 2_000; i++) queue.enqueue(`L${i}`);
		await queue.idle();
		clearInterval(timer);
		// Held in one chain of microtasks, the interval would not have run at all until the queue was idle.
		expect(turns).toBeGreaterThan(10);
	});
});
