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
	/** The link's live tags (by name) and projects (in the projects' order), by id. */
	tagIds: string[];
	projectIds: string[];
}

export interface TagJson {
	id: string;
	name: string;
	color: string | null;
	createdAt: number;
	/** Live, unarchived links carrying it. */
	count: number;
}

export interface ProjectJson {
	id: string;
	name: string;
	color: string;
	description: string | null;
	position: number;
	createdAt: number;
	/** Live, unarchived links in it. */
	count: number;
}

export interface SourceJson {
	id: string;
	name: string;
	hosts: string[];
}

/** How many links each list holds. */
export interface ViewCounts {
	links: number;
	unsorted: number;
	archive: number;
}

/** Which links a list shows: every unarchived link, Unsorted, Archive, one project or one tag. */
export type View =
	| { kind: 'all' }
	| { kind: 'unsorted' }
	| { kind: 'archive' }
	| { kind: 'project'; id: string }
	| { kind: 'tag'; id: string };

/**
 * Whether a link belongs in a view, on what the store can see: Archive holds archived links; the rest hold unarchived
 * ones, narrowed to one tag, one project, or (Unsorted) links with neither. A deleted link belongs nowhere.
 */
export function belongsToView(view: View, link: LinkJson): boolean {
	if (link.deletedAt !== null) return false;
	if ((view.kind === 'archive') !== (link.archivedAt !== null)) return false;
	switch (view.kind) {
		case 'unsorted':
			return link.tagIds.length === 0 && link.projectIds.length === 0;
		case 'tag':
			return link.tagIds.includes(view.id);
		case 'project':
			return link.projectIds.includes(view.id);
		default:
			return true;
	}
}

/** A link in the store. `pending` is true while it is an optimistic row the server has not confirmed yet. */
export type StoreLink = LinkJson & { pending: boolean };

export interface StoreState {
	links: StoreLink[];
	/** True until the first list has arrived. */
	loading: boolean;
	/** The view the links are from. */
	view: View;
	tags: TagJson[];
	projects: ProjectJson[];
	sources: SourceJson[];
	counts: ViewCounts;
	/** True once the tags, projects, sources and counts have arrived. */
	organised: boolean;
}

/** A new link: no id the store knows. The store makes its id, so the optimistic row keeps it. */
export interface NewLinkInput {
	url: string;
	title?: string | null;
	via?: SavedVia;
	/** Tags and projects the link joins as it is made (the view it was added on). */
	tagIds?: string[];
	projectIds?: string[];
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
	tagIds?: string[];
	projectIds?: string[];
}

/** One change to many links at once (bulk select). */
export interface BulkInput {
	ids: string[];
	addTagIds?: string[];
	removeTagIds?: string[];
	addProjectIds?: string[];
	removeProjectIds?: string[];
	status?: string | null;
	priority?: number | null;
	archived?: boolean;
	deleted?: true;
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
	/** Loads the live links of a view (matching `q` when given) into the store and returns them. */
	list(q?: string | null, view?: View): Promise<LinkJson[]>;
	/** Loads the tags, projects, sources and counts. */
	refresh(): Promise<void>;
	/**
	 * Links the screen has open (details, organiser) stay in the store even when a change takes them out of the view,
	 * so the open panel keeps working. Replaces the earlier set; links no longer held and out of the view go.
	 */
	hold(ids: string[]): void;
	/** One change to many links in one write; the links leave a view they no longer belong in. */
	bulk(change: BulkInput): Promise<LinkJson[]>;
	/** Records that the person opened a link. */
	opened(id: string): Promise<void>;
	/** Finds the tag of that name, or makes it. */
	createTag(name: string): Promise<TagJson>;
	updateTag(id: string, changes: { name?: string; color?: string | null }): Promise<TagJson>;
	deleteTag(id: string): Promise<void>;
	/** Moves every link from tag `id` to tag `into`, then deletes `id`. */
	mergeTag(id: string, into: string): Promise<void>;
	createProject(input: {
		name: string;
		color?: string;
		description?: string | null;
	}): Promise<ProjectJson>;
	updateProject(
		id: string,
		changes: { name?: string; color?: string; description?: string | null }
	): Promise<ProjectJson>;
	deleteProject(id: string): Promise<void>;
	/** Puts the projects in this order (every project id once). */
	reorderProjects(ids: string[]): Promise<void>;
	renameSource(id: string, name: string): Promise<SourceJson>;
	get(id: string): Promise<LinkJson | null>;
	/** Saves a new link (shown at once as a pending row) or changes fields of one the store holds. */
	put(input: NewLinkInput | LinkChanges): Promise<PutResult>;
	/** Deletes a link (gone from the list at once); `restore` undoes it. */
	remove(id: string): Promise<void>;
	restore(id: string): Promise<LinkJson>;
	/** Svelte's store contract: called at once with the state, then on every change. */
	subscribe(run: (state: StoreState) => void): () => void;
}
