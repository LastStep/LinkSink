import { sql } from 'drizzle-orm';
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { user } from './auth.schema.ts';

export * from './auth.schema.ts';

/**
 * Columns every synced table carries (ADR-0001): the global version of the row's last write, and a tombstone.
 * Never write these by hand: go through `syncWrite` (src/lib/server/sync/write.ts).
 */
const syncColumns = {
	version: integer('version').notNull(),
	deletedAt: integer('deleted_at')
};

/**
 * Where links come from (YouTube, GitHub, a blog), one per link. `hosts` is a JSON array of host suffixes: a link's
 * host matches the source with the longest suffix it ends with (src/lib/server/classify/source.ts).
 */
export const sources = sqliteTable(
	'sources',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		hosts: text('hosts').notNull().default('[]'),
		createdAt: integer('created_at').notNull(),
		...syncColumns
	},
	(t) => [
		uniqueIndex('sources_user_name_live')
			.on(t.userId, t.name)
			.where(sql`${t.deletedAt} IS NULL`),
		index('sources_user_version').on(t.userId, t.version)
	]
);

/** A saved link. Times are integer milliseconds since the epoch. */
export const links = sqliteTable(
	'links',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		// what it is
		url: text('url').notNull(),
		urlKey: text('url_key').notNull(),
		title: text('title'),
		description: text('description'),
		notes: text('notes'),
		// organising
		sourceId: text('source_id').references(() => sources.id),
		media: text('media'),
		status: text('status'),
		priority: integer('priority'),
		archivedAt: integer('archived_at'),
		// from the page
		siteName: text('site_name'),
		author: text('author'),
		publishedAt: integer('published_at'),
		durationS: integer('duration_s'),
		faviconPath: text('favicon_path'),
		imagePath: text('image_path'),
		metaState: text('meta_state').notNull().default('pending'),
		metaFetchedAt: integer('meta_fetched_at'),
		// bookkeeping
		userSet: text('user_set').notNull().default('[]'),
		savedVia: text('saved_via').notNull(),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull(),
		openedAt: integer('opened_at'),
		tagsText: text('tags_text').notNull().default(''),
		projectsText: text('projects_text').notNull().default(''),
		...syncColumns
	},
	(t) => [
		uniqueIndex('links_user_url_key_live')
			.on(t.userId, t.urlKey)
			.where(sql`${t.deletedAt} IS NULL`),
		index('links_user_created').on(t.userId, sql`${t.createdAt} DESC`, t.id),
		index('links_user_archived').on(t.userId, t.archivedAt),
		index('links_user_source').on(t.userId, t.sourceId),
		index('links_user_version').on(t.userId, t.version)
	]
);

/** A free word the person files links under. `name` is stored lower-case and trimmed. */
export const tags = sqliteTable(
	'tags',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		color: text('color'),
		createdAt: integer('created_at').notNull(),
		...syncColumns
	},
	(t) => [
		uniqueIndex('tags_user_name_live')
			.on(t.userId, t.name)
			.where(sql`${t.deletedAt} IS NULL`),
		index('tags_user_version').on(t.userId, t.version)
	]
);

/** A collection the person makes and names; `position` orders them in the sidebar. */
export const projects = sqliteTable(
	'projects',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		color: text('color').notNull(),
		description: text('description'),
		position: integer('position').notNull(),
		createdAt: integer('created_at').notNull(),
		...syncColumns
	},
	(t) => [
		uniqueIndex('projects_user_name_live')
			.on(t.userId, t.name)
			.where(sql`${t.deletedAt} IS NULL`),
		index('projects_user_version').on(t.userId, t.version)
	]
);

/** A tag on a link. Removing it soft-deletes the row; adding it again clears `deleted_at`. */
export const linkTags = sqliteTable(
	'link_tags',
	{
		linkId: text('link_id')
			.notNull()
			.references(() => links.id),
		tagId: text('tag_id')
			.notNull()
			.references(() => tags.id),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at').notNull(),
		...syncColumns
	},
	(t) => [
		primaryKey({ columns: [t.linkId, t.tagId] }),
		index('link_tags_tag').on(t.tagId),
		index('link_tags_user_version').on(t.userId, t.version)
	]
);

/** A link in a project; as `link_tags`. */
export const linkProjects = sqliteTable(
	'link_projects',
	{
		linkId: text('link_id')
			.notNull()
			.references(() => links.id),
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at').notNull(),
		...syncColumns
	},
	(t) => [
		primaryKey({ columns: [t.linkId, t.projectId] }),
		index('link_projects_project').on(t.projectId),
		index('link_projects_user_version').on(t.userId, t.version)
	]
);

/** One row per user: the global version every write bumps, and the oldest version a device may still pull from. */
export const syncMeta = sqliteTable('sync_meta', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	version: integer('version').notNull().default(0),
	tombstoneFloor: integer('tombstone_floor').notNull().default(0)
});

/** A device that pushes mutations, and the last mutation id the server applied from it. */
export const syncClients = sqliteTable(
	'sync_clients',
	{
		clientId: text('client_id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		lastMutationId: integer('last_mutation_id').notNull().default(0),
		lastSeenAt: integer('last_seen_at').notNull()
	},
	(t) => [index('sync_clients_user').on(t.userId)]
);
