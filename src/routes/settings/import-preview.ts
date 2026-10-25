// The import preview's shapes as the Settings screen sees them (T-0019), mirroring src/lib/server/import/mapping.ts,
// and the request that carries a mapping: one line of JSON, a newline, then the file.
import type { ImportFormat } from '#lib/import-format.ts';

export type FolderChoice =
	| { kind: 'new'; name: string }
	| { kind: 'existing'; projectId: string }
	| { kind: 'tag'; name: string }
	| { kind: 'none' };

export interface PreviewFolder {
	key: string;
	path: string[];
	count: number;
	container: boolean;
	suggested: FolderChoice;
}

export interface Preview {
	format: ImportFormat;
	formatLabel: string;
	links: number;
	duplicates: number;
	adding: number;
	unreadable: number;
	failures: { line: number; reason: string }[];
	loose: number;
	folders: PreviewFolder[];
	tags: string[];
	pocketRead: boolean;
}

export interface ImportChoices {
	mapping: Record<string, FolderChoice>;
	keepTags: boolean;
	pocketReadDone: boolean;
}

/** The content type of an import with its options (api.ts IMPORT_WITH_OPTIONS). */
export const IMPORT_WITH_OPTIONS = 'application/vnd.linksink.import';

/** The body of an import with its options: the options as one line of JSON, then the file's own bytes. */
export const importBody = (choices: ImportChoices, file: Blob) =>
	new Blob([JSON.stringify(choices), '\n', file]);

export const plural = (n: number, one: string, many = `${one}s`) =>
	`${n.toLocaleString()} ${n === 1 ? one : many}`;
