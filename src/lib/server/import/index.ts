import { IMPORT_MAX_BYTES, sniffFormat } from '../../import-format.ts';
import { parseNetscape } from './netscape.ts';
import { parsePocketCsv } from './pocket.ts';
import { ImportRefused, type ParsedFile } from './types.ts';

export { importItems, IMPORT_BATCH, TAGS_MAX, type ImportResult } from './write.ts';
export {
	ImportRefused,
	ImportStopped,
	type ImportFailure,
	type ImportItem,
	type ParsedFile
} from './types.ts';

const NOT_BOOKMARKS =
	'That is not a bookmarks file. Export your bookmarks as an HTML file (browsers, Raindrop, Pinboard, linkding) or a Pocket CSV, and choose that.';

/**
 * Reads an uploaded file into links: its bytes must be UTF-8 text no bigger than 20 MB, in a format `sniffFormat`
 * knows, holding at least one link. Anything else is refused as a whole (ImportRefused), before anything is written.
 */
export function parseImport(bytes: Uint8Array): ParsedFile {
	if (bytes.byteLength > IMPORT_MAX_BYTES) {
		throw new ImportRefused('That file is over 20 MB. Split it, or export fewer bookmarks.', 413);
	}
	if (bytes.byteLength === 0) throw new ImportRefused('That file is empty.');
	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		throw new ImportRefused(`${NOT_BOOKMARKS} (It is not UTF-8 text.)`);
	}
	if (text.includes('\u0000')) throw new ImportRefused(NOT_BOOKMARKS);
	const format = sniffFormat(text.slice(0, 65_536));
	if (!format) throw new ImportRefused(NOT_BOOKMARKS);
	const { items, failures } = format === 'netscape' ? parseNetscape(text) : parsePocketCsv(text);
	if (items.length === 0) {
		throw new ImportRefused(
			failures.length
				? `No link in that file could be read (line ${failures[0].line}: ${failures[0].reason})`
				: 'There are no links in that file.'
		);
	}
	return { format, items, failures };
}
