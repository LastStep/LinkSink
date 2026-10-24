-- Hand-written (drizzle-kit generate --custom): 0002 rebuilt the links table to add its foreign key to sources, and
-- SQLite drops a table's triggers with it. Recreate links_fts's three triggers exactly as 0001 made them, then
-- rebuild the index, since the rebuilt table's rowids need not match the old ones.
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
--> statement-breakpoint
INSERT INTO links_fts(links_fts) VALUES ('rebuild');
