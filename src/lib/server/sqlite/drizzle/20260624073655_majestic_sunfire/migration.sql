ALTER TABLE `tagFolderPaths` RENAME TO `tag_folder_paths`;--> statement-breakpoint
ALTER TABLE `tagFolders` RENAME TO `tag_folders`;--> statement-breakpoint
ALTER TABLE `devices` RENAME COLUMN `updated_at` TO `updatedAt`;--> statement-breakpoint
ALTER TABLE `displays` RENAME COLUMN `updated_at` TO `updatedAt`;