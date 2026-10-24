import type { DB } from '../db/open.ts';

/**
 * Proof that a write went through syncWrite (ADR-0001), checked from outside with no trigger: every table that
 * carries `user_id`, `version` and `deleted_at` is synced (found by its columns, so a new table is covered the day
 * it is added). Take a snapshot before a call and pass it to `expectVersioned` after.
 */
export function syncedTables(db: DB): string[] {
	const tables = db.$client
		.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
		.all() as { name: string }[];
	return tables
		.map((t) => t.name)
		.filter((name) => {
			const cols = (db.$client.pragma(`table_info("${name}")`) as { name: string }[]).map(
				(c) => c.name
			);
			return ['user_id', 'version', 'deleted_at'].every((c) => cols.includes(c));
		});
}

export interface Snapshot {
	rows: Map<string, { userId: string; version: number; content: string }>;
	versions: Map<string, number>;
}

export function snapshot(db: DB): Snapshot {
	const rows: Snapshot['rows'] = new Map();
	for (const table of syncedTables(db)) {
		for (const row of db.$client
			.prepare(`SELECT rowid AS _rowid, * FROM "${table}"`)
			.all() as Record<string, unknown>[]) {
			const { _rowid, version, ...rest } = row;
			rows.set(`${table}#${_rowid}`, {
				userId: String(rest.user_id),
				version: Number(version),
				content: JSON.stringify(rest)
			});
		}
	}
	const versions = new Map(
		(
			db.$client.prepare('SELECT user_id, version FROM sync_meta').all() as {
				user_id: string;
				version: number;
			}[]
		).map((r) => [r.user_id, r.version])
	);
	return { rows, versions };
}

/**
 * Throws, naming the row, if any synced row changed between the two snapshots without its version rising past the
 * user's version before (and landing on the user's version after), or if a synced row vanished (deletes are
 * tombstones). Returns how many rows changed, so a test can also see that something was written.
 */
export function expectVersioned(before: Snapshot, after: Snapshot): number {
	let changed = 0;
	for (const [key, row] of before.rows) {
		if (!after.rows.has(key))
			throw new Error(`${key} was removed: synced rows are soft-deleted only`);
		void row;
	}
	for (const [key, row] of after.rows) {
		const was = before.rows.get(key);
		if (was && was.content === row.content && was.version === row.version) continue;
		changed++;
		const floor = before.versions.get(row.userId) ?? 0;
		const now = after.versions.get(row.userId) ?? 0;
		if (row.version <= floor || row.version !== now) {
			throw new Error(
				`${key} changed without a new version: row version ${row.version}, user's version ${floor} before and ${now} after`
			);
		}
	}
	return changed;
}
