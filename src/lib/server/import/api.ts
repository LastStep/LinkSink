// The import and export endpoints (POST /api/import, GET /api/export.html, GET /api/export.json), free of SvelteKit
// imports so unit tests call them on their own database. Every read and write is the caller's own.
import { FORMAT_LABEL, IMPORT_MAX_BYTES } from '../../import-format.ts';
import type { Caller } from '../api/links.ts';
import type { DB } from '../db/open.ts';
import { exportHtml, exportJson, exportName } from '../export.ts';
import type { SyncWrite } from '../sync/write.ts';
import { importItems, ImportRefused, parseImport } from './index.ts';

/** How many failing lines the summary lists. */
export const FAILURES_SHOWN = 5;

/**
 * Content types an upload may carry: none a cross-site form can send (those are urlencoded, multipart and
 * text/plain), so a browser sends one only from this site's own page, after a CORS preflight anywhere else.
 */
const UPLOAD_TYPES = ['application/octet-stream', 'text/html', 'text/csv'];

const problem = (status: number, message: string) => Response.json({ error: message }, { status });

/** The body, read no further than the limit. */
async function readCapped(request: Request, max: number): Promise<Uint8Array> {
	const length = Number(request.headers.get('content-length') ?? NaN);
	if (length > max)
		throw new ImportRefused('That file is over 20 MB. Split it, or export fewer bookmarks.', 413);
	if (!request.body) return new Uint8Array();
	const reader = request.body.getReader();
	const parts: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > max) {
			await reader.cancel();
			throw new ImportRefused('That file is over 20 MB. Split it, or export fewer bookmarks.', 413);
		}
		parts.push(value);
	}
	const out = new Uint8Array(size);
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.byteLength;
	}
	return out;
}

export function createImportApi({
	db,
	syncWrite,
	onCreated = () => {}
}: {
	db: DB;
	syncWrite: SyncWrite;
	/** Called with each new link's id once it is written: the app queues its page details fetch. */
	onCreated?: (linkId: string) => void;
}) {
	return {
		/**
		 * POST /api/import, the file as the body: 200 with a summary {format, formatLabel, added, duplicates, failed,
		 * failures (the first few, by line)}; 400 or 413 with {error} when the file is refused, nothing written.
		 */
		async import(caller: Caller, request: Request): Promise<Response> {
			if (!caller) return problem(401, 'Sign in first.');
			const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
			if (!UPLOAD_TYPES.includes(type)) {
				return problem(415, 'Send the file itself as the body (application/octet-stream).');
			}
			try {
				const parsed = parseImport(await readCapped(request, IMPORT_MAX_BYTES));
				const result = importItems(syncWrite, caller.id, parsed.items, onCreated);
				const failures = [...parsed.failures, ...result.failures].sort((a, b) => a.line - b.line);
				return Response.json({
					format: parsed.format,
					formatLabel: FORMAT_LABEL[parsed.format],
					added: result.added,
					duplicates: result.duplicates,
					failed: failures.length,
					failures: failures.slice(0, FAILURES_SHOWN)
				});
			} catch (error) {
				if (error instanceof ImportRefused) return problem(error.status, error.message);
				console.error('[import] failed', error);
				return problem(
					500,
					'Something went wrong importing that file. Nothing was lost; try again.'
				);
			}
		},

		/** GET /api/export.html : the bookmark file, as a download. */
		exportHtml(caller: Caller): Response {
			if (!caller) return problem(401, 'Sign in first.');
			return new Response(exportHtml(db, caller.id), {
				headers: {
					'content-type': 'text/html; charset=utf-8',
					'content-disposition': `attachment; filename="${exportName('bookmarks', 'html')}"`,
					'cache-control': 'no-store'
				}
			});
		},

		/** GET /api/export.json : everything, as a download. */
		exportJson(caller: Caller): Response {
			if (!caller) return problem(401, 'Sign in first.');
			return new Response(JSON.stringify(exportJson(db, caller.id), null, 1), {
				headers: {
					'content-type': 'application/json; charset=utf-8',
					'content-disposition': `attachment; filename="${exportName('export', 'json')}"`,
					'cache-control': 'no-store'
				}
			});
		}
	};
}

export type ImportApi = ReturnType<typeof createImportApi>;
