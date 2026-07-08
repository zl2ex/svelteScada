
CREATE TABLE `tag` (
	`id` text PRIMARY KEY,
	`folderId` text,
	`name` text NOT NULL,
	`dataType` text NOT NULL,
	`type` text DEFAULT 'tag' NOT NULL,
	`value` real,
	`nodeId` text,
	`writeable` integer,
	`exposeOverOpcua` integer,
	`parameters` text,
	CONSTRAINT `fk_tag_folderId_tagFolders_id_fk` FOREIGN KEY (`folderId`) REFERENCES `tag_folders`(`id`) ON DELETE SET NULL
);