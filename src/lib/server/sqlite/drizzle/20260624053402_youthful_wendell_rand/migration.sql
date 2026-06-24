CREATE TABLE `devices` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `displays` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY,
	`folderId` text,
	`name` text NOT NULL,
	`dataType` text NOT NULL,
	`value` real,
	`nodeId` text,
	`writeable` integer,
	`exposeOverOpcua` integer,
	`parameters` text,
	`updatedAt` integer,
	CONSTRAINT `fk_tag_folderId_tagFolders_id_fk` FOREIGN KEY (`folderId`) REFERENCES `tagFolders`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `tagFolderPaths` (
	`ancestor` text NOT NULL,
	`descendant` text NOT NULL,
	`depth` integer NOT NULL,
	CONSTRAINT `tagFolderPaths_pk` PRIMARY KEY(`ancestor`, `descendant`),
	CONSTRAINT `fk_tagFolderPaths_ancestor_tagFolders_id_fk` FOREIGN KEY (`ancestor`) REFERENCES `tagFolders`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_tagFolderPaths_descendant_tagFolders_id_fk` FOREIGN KEY (`descendant`) REFERENCES `tagFolders`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `tagFolders` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`permissionsFK` text,
	CONSTRAINT `fk_user_permissionsFK_user_permissions_id_fk` FOREIGN KEY (`permissionsFK`) REFERENCES `user_permissions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`id` text PRIMARY KEY,
	`read` integer DEFAULT false,
	`write` integer DEFAULT false,
	`edit` integer DEFAULT false
);
