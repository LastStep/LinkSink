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

/** A link in the store. `pending` is true while it is an optimistic row the server has not confirmed yet. */
export type StoreLink = LinkJson & { pending: boolean };

export interface StoreState {
	links: StoreLink[];
	/** True until the first list has arrived. */
	loading: boolean;
}

/** A new link: no id the store knows. The store makes its id, so the optimistic row keeps it. */
export interface NewLinkInput {
	url: string;
	title?: string | null;
	via?: SavedVia;
}

/** Fields to change on a link the store holds. */
export interface LinkChanges {
	id: string;
	title?: string;
	description?: string | null;
	notes?: string | null;
	sourceId?: string | null;
	media?: string;
	status?: string | null;
	priority?: number | null;
	archived?: boolean;
}

export interface PutResult {
	link: LinkJson;
	/** True when the address was already saved: `link` is the existing one and nothing new was made. */
	duplicate: boolean;
}

/** A failure the person can read. */
export class StoreError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

export interface LinkStore {
	/** Loads the live links (matching `q` when given) into the store and returns them. */
	list(q?: string | null): Promise<LinkJson[]>;
	get(id: string): Promise<LinkJson | null>;
	/** Saves a new link (shown at once as a pending row) or changes fields of one the store holds. */
	put(input: NewLinkInput | LinkChanges): Promise<PutResult>;
	/** Deletes a link (gone from the list at once); `restore` undoes it. */
	remove(id: string): Promise<void>;
	restore(id: string): Promise<LinkJson>;
	/** Svelte's store contract: called at once with the state, then on every change. */
	subscribe(run: (state: StoreState) => void): () => void;
}
