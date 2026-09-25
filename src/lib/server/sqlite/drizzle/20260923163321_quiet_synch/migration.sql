ALTER TABLE `tags` RENAME COLUMN `value` TO `intialValue`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tags` (
	`id` text PRIMARY KEY,
	`folderId` text,
	`name` text NOT NULL,
	`dataType` text NOT NULL,
	`type` text DEFAULT 'tag' NOT NULL,
	`intialValue` text,
	`nodeId` text,
	`writeable` integer DEFAULT true,
	`exposeOverOpcua` integer DEFAULT true,
	`parameters` text,
	CONSTRAINT `fk_tag_folderId_tagFolders_id_fk` FOREIGN KEY (`folderId`) REFERENCES `tag_folders`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
INSERT INTO `__new_tags`(`id`, `folderId`, `name`, `dataType`, `type`, `intialValue`, `nodeId`, `writeable`, `exposeOverOpcua`, `parameters`) SELECT `id`, `folderId`, `name`, `dataType`, `type`, `intialValue`, `nodeId`, `writeable`, `exposeOverOpcua`, `parameters` FROM `tags`;--> statement-breakpoint
DROP TABLE `tags`;--> statement-breakpoint
ALTER TABLE `__new_tags` RENAME TO `tags`;--> statement-breakpoint
PRAGMA foreign_keys=ON;