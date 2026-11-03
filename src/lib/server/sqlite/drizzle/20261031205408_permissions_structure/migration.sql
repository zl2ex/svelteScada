ALTER TABLE `tags` ADD `writeLevel` text DEFAULT 'operator' NOT NULL;--> statement-breakpoint
DELETE FROM `user_permissions`;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `action` text NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `subject` text NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `conditions` text;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `fields` text;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `inverted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'viewer' NOT NULL;--> statement-breakpoint
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
	`unit` text DEFAULT '' NOT NULL,
	`bindings` text,
	`writeLevel` text DEFAULT 'operator' NOT NULL,
	CONSTRAINT `fk_tag_folderId_tagFolders_id_fk` FOREIGN KEY (`folderId`) REFERENCES `tag_folders`(`id`) ON DELETE SET NULL,
	CONSTRAINT "tags_writeLevel_check" CHECK("writeLevel" in ('operator', 'engineer', 'admin'))
);
--> statement-breakpoint
INSERT INTO `__new_tags`(`id`, `folderId`, `name`, `dataType`, `type`, `intialValue`, `nodeId`, `writeable`, `exposeOverOpcua`, `parameters`, `unit`, `bindings`) SELECT `id`, `folderId`, `name`, `dataType`, `type`, `intialValue`, `nodeId`, `writeable`, `exposeOverOpcua`, `parameters`, `unit`, `bindings` FROM `tags`;--> statement-breakpoint
DROP TABLE `tags`;--> statement-breakpoint
ALTER TABLE `__new_tags` RENAME TO `tags`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_permissions` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`read` integer DEFAULT false,
	`write` integer DEFAULT false,
	`edit` integer DEFAULT false,
	`action` text NOT NULL,
	`subject` text NOT NULL,
	`conditions` text,
	`fields` text,
	`inverted` integer DEFAULT false NOT NULL,
	`reason` text,
	CONSTRAINT `fk_user_permissions_userId_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT "user_permissions_action_check" CHECK("action" in ('read', 'create', 'update', 'delete', 'manage', 'write')),
	CONSTRAINT "user_permissions_subject_check" CHECK("subject" in ('all', 'User', 'Project', 'Page', 'Element', 'UserComponent', 'Device', 'Tag', 'TagFolder', 'TagValue', 'Trend'))
);
--> statement-breakpoint
INSERT INTO `__new_user_permissions`(`id`, `userId`, `read`, `write`, `edit`) SELECT `id`, `userId`, `read`, `write`, `edit` FROM `user_permissions`;--> statement-breakpoint
DROP TABLE `user_permissions`;--> statement-breakpoint
ALTER TABLE `__new_user_permissions` RENAME TO `user_permissions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	CONSTRAINT "users_role_check" CHECK("role" in ('admin', 'editor', 'engineer', 'operator', 'viewer'))
);
--> statement-breakpoint
INSERT INTO `__new_users`(`id`, `name`, `email`, `password`) SELECT `id`, `name`, `email`, `password` FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `user_permissions_user_idx` ON `user_permissions` (`userId`);