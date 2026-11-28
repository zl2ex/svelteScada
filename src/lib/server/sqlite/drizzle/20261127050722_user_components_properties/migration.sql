ALTER TABLE `user_components` ADD `properties` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_components` DROP COLUMN `props`;
