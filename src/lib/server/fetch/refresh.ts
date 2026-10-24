import { and, eq, isNull } from 'drizzle-orm';
import type { UserSetField } from '../../fields.ts';
import { classifyMedia } from '../classify/media.ts';
import { resolveSource } from '../classify/source.ts';
import type { DB } from '../db/open.ts';
import { links } from '../db/schema.ts';
import type { SyncWrite, SyncWriter } from '../sync/write.ts';
import { fetchImage } from './images.ts';
import { fetchMeta, type PageMeta } from './meta.ts';
import type { SafeFetch } from './safe.ts';

export interface FetchDeps {
	db: DB;
	syncWrite: SyncWrite;
	safeFetch: SafeFetch;
	/** Where the image cache lives (data/media). */
	mediaDir: string;
}

type LinkRow = typeof links.$inferSelect;
type LinkPatch = Partial<typeof links.$inferInsert>;

export function parseUserSet(json: string | null | undefined): Set<UserSetField> {
	try {
		const value = JSON.parse(json ?? '[]');
		return new Set(Array.isArray(value) ? value : []);
	} catch {
		return new Set();
	}
}

/** The title a link shows when the page gave none: its host, without `www.`. */
export function hostTitle(url: string): string {
	return new URL(url).hostname.replace(/^www\./, '');
}

function liveLink(w: SyncWriter, id: string): LinkRow | undefined {
	return w.tx
		.select()
		.from(links)
		.where(and(eq(links.id, id), eq(links.userId, w.userId), isNull(links.deletedAt)))
		.get();
}

/** The live link with this id, whoever owns it (the queue knows only ids). */
function findLink(db: DB, id: string): LinkRow | undefined {
	return db
		.select()
		.from(links)
		.where(and(eq(links.id, id), isNull(links.deletedAt)))
		.get();
}

/**
 * What a fetch writes on a link: the page's details, the source and media, and `meta_state = ok`. Read and written
 * in one syncWrite, so a hand edit made while the page was being fetched is seen: title, description, source and
 * media are written only when not in `user_set`. Fields the page did not give keep what the link had.
 */
export function applyMeta(
	w: SyncWriter,
	row: LinkRow,
	meta: PageMeta,
	images: { imagePath: string | null; faviconPath: string | null }
): LinkPatch {
	const userSet = parseUserSet(row.userSet);
	const patch: LinkPatch = { metaState: 'ok', metaFetchedAt: w.now };
	if (!userSet.has('title')) patch.title = meta.title ?? row.title ?? hostTitle(row.url);
	if (!userSet.has('description') && meta.description !== null)
		patch.description = meta.description;
	if (!userSet.has('source')) patch.sourceId = resolveSource(w, meta.finalUrl, meta.siteName);
	if (!userSet.has('media')) {
		patch.media = classifyMedia({
			url: meta.finalUrl,
			contentType: meta.contentType,
			ogType: meta.ogType,
			oembedType: meta.oembedType
		});
	}
	if (meta.siteName !== null) patch.siteName = meta.siteName;
	if (meta.author !== null) patch.author = meta.author;
	if (meta.publishedAt !== null) patch.publishedAt = meta.publishedAt;
	if (meta.durationS !== null) patch.durationS = meta.durationS;
	if (images.imagePath) patch.imagePath = images.imagePath;
	if (images.faviconPath) patch.faviconPath = images.faviconPath;
	return patch;
}

/** What a failed fetch writes: `meta_state = failed`; the title stays (or becomes) the host; source and media from the URL alone. */
export function applyFailure(w: SyncWriter, row: LinkRow): LinkPatch {
	const userSet = parseUserSet(row.userSet);
	const patch: LinkPatch = { metaState: 'failed', metaFetchedAt: w.now };
	if (!userSet.has('title') && !row.title) patch.title = hostTitle(row.url);
	if (!userSet.has('source') && !row.sourceId) patch.sourceId = resolveSource(w, row.url, null);
	if (!userSet.has('media') && !row.media) patch.media = classifyMedia({ url: row.url });
	return patch;
}

/**
 * Fetches one link's page details and images, then writes them through syncWrite. Throws when the page could not be
 * read (FetchRefused or FetchFailed); the queue decides whether to retry and records the failure. Returns false
 * when the link is gone.
 */
export async function refreshLink(deps: FetchDeps, linkId: string): Promise<boolean> {
	const row = findLink(deps.db, linkId);
	if (!row) return false;
	const meta = await fetchMeta(deps.safeFetch, row.url);
	const [imagePath, faviconPath] = await Promise.all([
		fetchImage(deps.safeFetch, deps.mediaDir, 'preview', meta.imageUrl),
		fetchImage(deps.safeFetch, deps.mediaDir, 'favicon', meta.iconUrl)
	]);
	return deps.syncWrite(row.userId, (w) => {
		const current = liveLink(w, linkId);
		if (!current) return false;
		w.update(links, eq(links.id, linkId), applyMeta(w, current, meta, { imagePath, faviconPath }));
		return true;
	});
}

/** Records that a link's details could not be fetched. */
export function markFailed(deps: Pick<FetchDeps, 'db' | 'syncWrite'>, linkId: string): void {
	const row = findLink(deps.db, linkId);
	if (!row) return;
	deps.syncWrite(row.userId, (w) => {
		const current = liveLink(w, linkId);
		if (!current) return;
		w.update(links, eq(links.id, linkId), applyFailure(w, current));
	});
}
