// The fetch queue's feeder (T-0012, C1): links waiting for their page details (`meta_state = 'pending'`) are read
// from the database a few at a time while the queue runs low, never all at once. The queue then holds at most
// `low - 1 + batch` links however many are waiting, and a restart picks up where it stopped.
import { and, asc, eq, gt, isNull, notInArray } from 'drizzle-orm';
import type { DB } from '../db/open.ts';
import { links } from '../db/schema.ts';
import type { FetchQueue } from './queue.ts';

/** Up to `limit` ids of links waiting for their details, after `after` in id order, none of `exclude`. */
export function nextPending(db: DB, after: string, limit: number, exclude: string[]): string[] {
	return db
		.select({ id: links.id })
		.from(links)
		.where(
			and(
				gt(links.id, after),
				eq(links.metaState, 'pending'),
				isNull(links.deletedAt),
				exclude.length ? notInArray(links.id, exclude) : undefined
			)
		)
		.orderBy(asc(links.id))
		.limit(limit)
		.all()
		.map((r) => r.id);
}

export interface Feeder {
	/** Tops the queue up from where the last read stopped (cheap: a range of the primary key). */
	fill(): void;
	/** Starts again from the first waiting link, then tops up: after an import, and at start. */
	kick(): void;
}

export function createFeeder({
	queue,
	next,
	low = 4,
	batch = 8
}: {
	queue: Pick<FetchQueue, 'enqueue' | 'pending' | 'queuedIds'>;
	/** The next waiting ids after a cursor (nextPending on the app's database). */
	next: (after: string, limit: number, exclude: string[]) => string[];
	/** Read more when fewer than this many are queued. */
	low?: number;
	/** How many to read at a time. */
	batch?: number;
}): Feeder {
	let cursor = '';
	let filling = false;
	function fill() {
		if (filling) return;
		filling = true;
		try {
			while (queue.pending < low) {
				const ids = next(cursor, batch, queue.queuedIds());
				if (ids.length === 0) break;
				cursor = ids.at(-1)!;
				for (const id of ids) queue.enqueue(id);
			}
		} finally {
			filling = false;
		}
	}
	return {
		fill,
		kick() {
			cursor = '';
			fill();
		}
	};
}
