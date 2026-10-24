CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`hosts` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`version` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_user_name_live` ON `sources` (`user_id`,`name`) WHERE "sources"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `sources_user_version` ON `sources` (`user_id`,`version`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`url` text NOT NULL,
	`url_key` text NOT NULL,
	`title` text,
	`description` text,
	`notes` text,
	`source_id` text,
	`media` text,
	`status` text,
	`priority` integer,
	`archived_at` integer,
	`site_name` text,
	`author` text,
	`published_at` integer,
	`duration_s` integer,
	`favicon_path` text,
	`image_path` text,
	`meta_state` text DEFAULT 'pending' NOT NULL,
	`meta_fetched_at` integer,
	`user_set` text DEFAULT '[]' NOT NULL,
	`saved_via` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`opened_at` integer,
	`tags_text` text DEFAULT '' NOT NULL,
	`projects_text` text DEFAULT '' NOT NULL,
	`version` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_links`("id", "user_id", "url", "url_key", "title", "description", "notes", "source_id", "media", "status", "priority", "archived_at", "site_name", "author", "published_at", "duration_s", "favicon_path", "image_path", "meta_state", "meta_fetched_at", "user_set", "saved_via", "created_at", "updated_at", "opened_at", "tags_text", "projects_text", "version", "deleted_at") SELECT "id", "user_id", "url", "url_key", "title", "description", "notes", "source_id", "media", "status", "priority", "archived_at", "site_name", "author", "published_at", "duration_s", "favicon_path", "image_path", "meta_state", "meta_fetched_at", "user_set", "saved_via", "created_at", "updated_at", "opened_at", "tags_text", "projects_text", "version", "deleted_at" FROM `links`;--> statement-breakpoint
DROP TABLE `links`;--> statement-breakpoint
ALTER TABLE `__new_links` RENAME TO `links`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `links_user_url_key_live` ON `links` (`user_id`,`url_key`) WHERE "links"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `links_user_created` ON `links` (`user_id`,"created_at" DESC,`id`);--> statement-breakpoint
CREATE INDEX `links_user_archived` ON `links` (`user_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `links_user_source` ON `links` (`user_id`,`source_id`);--> statement-breakpoint
CREATE INDEX `links_user_version` ON `links` (`user_id`,`version`);