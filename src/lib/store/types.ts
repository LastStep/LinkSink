import type { SavedVia, UserSetField } from '../fields.ts';

/** A link as the API sends it and the store holds it. Times are milliseconds since the epoch. */
export interface LinkJson {
	id: string;
	url: string;
	urlKey: string;
	title: string | null;
	description: string | null;
	notes: string | null;
	sourceId: string | null;
	media: string | null;
	status: string | null;
	priority: number | null;
	archivedAt: number | null;
	siteName: string | null;
	author: string | null;
	publishedAt: number | null;
	durationS: number | null;
	faviconPath: string | null;
	imagePath: string | null;
	metaState: string;
	metaFetchedAt: number | null;
	userSet: UserSetField[];
	savedVia: SavedVia | string;
	createdAt: number;
	updatedAt: number;
	openedAt: number | null;
	tagsText: string;
	projectsText: string;
	version: number;
	deletedAt: number | null;
}
