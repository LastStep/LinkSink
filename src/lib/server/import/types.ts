import type { ImportFormat } from '../../import-format.ts';
import type { Status } from '../../fields.ts';

/** One link read from an import file, before it is checked against what is saved. */
export interface ImportItem {
	url: string;
	title: string | null;
	/** Tag names as the file gives them. */
	tags: string[];
	/** Project names: a folder path joined with " / ". */
	projects: string[];
	/** When it was saved, in ms; null for "now". */
	createdAt: number | null;
	notes: string | null;
	status: Status | null;
	archived: boolean;
	/** The line of the file it starts on (1-based), for the summary. */
	line: number;
}

/** A line of the file that did not give a link. */
export interface ImportFailure {
	line: number;
	reason: string;
}

export interface ParsedFile {
	format: ImportFormat;
	items: ImportItem[];
	failures: ImportFailure[];
}

/** A file refused as a whole; nothing is written and the message is safe to show. */
export class ImportRefused extends Error {
	constructor(
		message: string,
		readonly status = 400
	) {
		super(message);
	}
}

/** Seconds (or ms, or µs) since 1970 from a file, as ms; null when missing or not a plausible date. */
export function fileTime(value: string | undefined | null): number | null {
	if (!value || !/^\s*\d+\s*$/.test(value)) return null;
	const n = Number(value);
	if (!Number.isSafeInteger(n) || n <= 0) return null;
	// Every format named in T-0012 writes seconds; a few older tools wrote ms or µs, told apart by size.
	const ms = n > 1e14 ? Math.floor(n / 1000) : n > 1e11 ? n : n * 1000;
	return ms < Date.UTC(2200, 0, 1) ? ms : null;
}
