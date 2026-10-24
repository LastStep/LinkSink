CREATE TABLE `link_projects` (
	`link_id` text NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`version` integer NOT NULL,
	`deleted_at` integer,
	PRIMARY KEY(`link_id`, `project_id`),
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `link_projects_project` ON `link_projects` (`project_id`);--> statement-breakpoint
CREATE INDEX `link_projects_user_version` ON `link_projects` (`user_id`,`version`);--> statement-breakpoint
CREATE TABLE `link_tags` (
	`link_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`version` integer NOT NULL,
	`deleted_at` integer,
	PRIMARY KEY(`link_id`, `tag_id`),
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `link_tags_tag` ON `link_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `link_tags_user_version` ON `link_tags` (`user_id`,`version`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`description` text,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`version` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_user_name_live` ON `projects` (`user_id`,`name`) WHERE "projects"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `projects_user_version` ON `projects` (`user_id`,`version`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` integer NOT NULL,
	`version` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_name_live` ON `tags` (`user_id`,`name`) WHERE "tags"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `tags_user_version` ON `tags` (`user_id`,`version`);