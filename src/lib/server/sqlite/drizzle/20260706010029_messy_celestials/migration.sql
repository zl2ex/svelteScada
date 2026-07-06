ALTER TABLE `tag_folder_paths` RENAME COLUMN `ancestor` TO `parent`;--> statement-breakpoint
ALTER TABLE `tag_folder_paths` RENAME COLUMN `descendant` TO `child`;