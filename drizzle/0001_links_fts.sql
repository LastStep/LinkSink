-- Full-text search over links (hand-written: drizzle-kit does not model FTS5).
-- External-content table on links' rowid; unicode61 folds case and diacritics; prefix indexes for type-ahead.
CREATE VIRTUAL TABLE `links_fts` USING fts5(
	title, description, notes, url, site_name, tags_text, projects_text,
	content='links', content_rowid='rowid',
	tokenize='unicode61 remove_diacritics 2', prefix='2 3'
);
--> statement-breakpoint
CREATE TRIGGER `links_fts_ai` AFTER INSERT ON `links` BEGIN
	INSERT INTO links_fts(rowid, title, description, notes, url, site_name, tags_text, projects_text)
	VALUES (new.rowid, new.title, new.description, new.notes, new.url, new.site_name, new.tags_text, new.projects_text);
END;
--> statement-breakpoint
CREATE TRIGGER `links_fts_ad` AFTER DELETE ON `links` BEGIN
	INSERT INTO links_fts(links_fts, rowid, title, description, notes, url, site_name, tags_text, projects_text)
	VALUES ('delete', old.rowid, old.title, old.description, old.notes, old.url, old.site_name, old.tags_text, old.projects_text);
END;
--> statement-breakpoint
CREATE TRIGGER `links_fts_au` AFTER UPDATE ON `links` BEGIN
	INSERT INTO links_fts(links_fts, rowid, title, description, notes, url, site_name, tags_text, projects_text)
	VALUES ('delete', old.rowid, old.title, old.description, old.notes, old.url, old.site_name, old.tags_text, old.projects_text);
	INSERT INTO links_fts(rowid, title, description, notes, url, site_name, tags_text, projects_text)
	VALUES (new.rowid, new.title, new.description, new.notes, new.url, new.site_name, new.tags_text, new.projects_text);
END;
