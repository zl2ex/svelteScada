CREATE TABLE `user_theme` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`projectStyle` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `elements` ADD `styleClass` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `themeId` text REFERENCES user_theme(id);