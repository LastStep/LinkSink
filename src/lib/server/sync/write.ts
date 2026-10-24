import { and, getTableColumns, isNull, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { DB } from '../db/open.ts';
import { syncMeta } from '../db/schema.ts';

/** A table synced per ADR-0001: it carries user_id, version and deleted_at. */
export type SyncedTable = SQLiteTable & {
	userId: SQLiteColumn;
	version: SQLiteColumn;
	deletedAt: SQLiteColumn;
};

type Stamped = 'userId' | 'version' | 'deletedAt';
type Auto = 'createdAt' | 'updatedAt';
type InsertRow<T extends SyncedTable> = Omit<T['$inferInsert'], Stamped | Auto> &
	Partial<Pick<T['$inferInsert'], Extract<keyof T['$inferInsert'], Auto>>>;
type Patch<T extends SyncedTable> = Partial<Omit<T['$inferInsert'], 'userId' | 'version' | 'id'>>;

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

/** What a write's function gets: the one version this write stamps, and the only ways to change synced rows. */
export interface SyncWriter {
	readonly tx: Tx;
	readonly userId: string;
	/** The global version this write took; every row it changes carries it. */
	readonly version: number;
	/** The write's clock, in milliseconds; used for created_at, updated_at and deleted_at. */
	readonly now: number;
	insert<T extends SyncedTable>(table: T, row: InsertRow<T>): void;
	/** Updates the user's rows matching `where`; returns how many changed. */
	update<T extends SyncedTable>(table: T, where: SQL, patch: Patch<T>): number;
	/** Soft-deletes the user's live rows matching `where` (the rows stay, with deleted_at set); returns how many. */
	softDelete<T extends SyncedTable>(table: T, where: SQL): number;
}

function hasColumn(table: SQLiteTable, name: string) {
	return name in getTableColumns(table);
}

/**
 * Builds `syncWrite(userId, fn)`: runs `fn` in one immediate transaction, bumps the user's global version once, and
 * stamps every row `fn` inserts, updates or soft-deletes with that version. Every write to a synced table goes
 * through here (ADR-0001); a write any other way never reaches the user's other devices.
 */
export function createSyncWrite(db: DB) {
	return function syncWrite<R>(userId: string, fn: (w: SyncWriter) => R): R {
		return db.transaction(
			(tx) => {
				const [meta] = tx
					.insert(syncMeta)
					.values({ userId, version: 1 })
					.onConflictDoUpdate({ target: syncMeta.userId, set: { version: sql`${syncMeta.version} + 1` } })
					.returning({ version: syncMeta.version })
					.all();
				const version = meta.version;
				const now = Date.now();
				const mine = (table: SyncedTable, where: SQL) => and(where, sql`${table.userId} = ${userId}`);

				const writer: SyncWriter = {
					tx,
					userId,
					version,
					now,
					insert(table, row) {
						const values: Record<string, unknown> = { ...row, userId, version, deletedAt: null };
						if (hasColumn(table, 'createdAt')) values.createdAt ??= now;
						if (hasColumn(table, 'updatedAt')) values.updatedAt ??= now;
						tx.insert(table).values(values as never).run();
					},
					update(table, where, patch) {
						const set: Record<string, unknown> = { ...patch, version };
						if (hasColumn(table, 'updatedAt')) set.updatedAt ??= now;
						return tx
							.update(table)
							.set(set as never)
							.where(mine(table, where))
							.run().changes;
					},
					softDelete(table, where) {
						const set: Record<string, unknown> = { deletedAt: now, version };
						if (hasColumn(table, 'updatedAt')) set.updatedAt = now;
						return tx
							.update(table)
							.set(set as never)
							.where(and(mine(table, where), isNull(table.deletedAt)))
							.run().changes;
					}
				};
				return fn(writer);
			},
			{ behavior: 'immediate' }
		);
	};
}

export type SyncWrite = ReturnType<typeof createSyncWrite>;
