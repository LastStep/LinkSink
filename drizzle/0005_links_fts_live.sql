-- Hand-written (drizzle-kit generate --custom; drizzle-kit does not model FTS5). T-0009: links_fts holds live links
-- only. A soft-deleted link leaves the index when it is deleted and comes back when it is restored; the triggers keep
-- that, and each FTS5 'delete' names exactly the values the row was indexed with. Never run FTS5's 'rebuild' on this
-- table (it reads every row of links, tombstones included): reindexLinks() in src/lib/server/search.ts rebuilds it.
DROP TRIGGER IF EXISTS `links_fts_ai`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `links_fts_ad`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `links_fts_au`;
--> statement-breakpoint
CREATE TRIGGER `links_fts_ai` AFTER INSERT ON `links` WHEN new.deleted_at IS NULL BEGIN
	INSERT INTO links_fts(rowid, title, description, notes, url, site_name, tags_text, projects_text)
	VALUES (new.rowid, new.title, new.description, new.notes, new.url, new.site_name, new.tags_text, new.projects_text);
END;
--> statement-breakpoint
CREATE TRIGGER `links_fts_ad` AFTER DELETE ON `links` WHEN old.deleted_at IS NULL BEGIN
	INSERT INTO links_fts(links_fts, rowid, title, description, notes, url, site_name, tags_text, projects_text)
	VALUES ('delete', old.rowid, old.title, old.description, old.notes, old.url, old.site_name, old.tags_text, old.projects_text);
END;
--> statement-breakpoint
CREATE TRIGGER `links_fts_au` AFTER UPDATE ON `links` BEGIN
	INSERT INTO links_fts(links_fts, rowid, title, description, notes, url, site_name, tags_text, projects_text)
	SELECT 'delete', old.rowid, old.title, old.description, old.notes, old.url, old.site_name, old.tags_text, old.projects_text
	WHERE old.deleted_at IS NULL;
	INSERT INTO links_fts(rowid, title, description, notes, url, site_name, tags_text, projects_text)
	SELECT new.rowid, new.title, new.description, new.notes, new.url, new.site_name, new.tags_text, new.projects_text
	WHERE new.deleted_at IS NULL;
END;
--> statement-breakpoint
INSERT INTO links_fts(links_fts) VALUES ('delete-all');
--> statement-breakpoint
INSERT INTO links_fts(rowid, title, description, notes, url, site_name, tags_text, projects_text)
SELECT rowid, title, description, notes, url, site_name, tags_text, projects_text FROM links WHERE deleted_at IS NULL;
