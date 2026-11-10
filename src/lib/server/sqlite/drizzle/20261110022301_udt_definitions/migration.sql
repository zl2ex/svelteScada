CREATE TABLE `udt_definition_tags` (
	`id` text PRIMARY KEY,
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
	`trend_enabled` integer DEFAULT false NOT NULL,
	`trend_minimumSamplingIntervalMs` integer DEFAULT 1000 NOT NULL,
	`udtDefinitionId` text NOT NULL,
	CONSTRAINT `fk_udt_definition_tags_udtDefinitionId_udt_definitions_id_fk` FOREIGN KEY (`udtDefinitionId`) REFERENCES `udt_definitions`(`id`) ON DELETE CASCADE,
	CONSTRAINT "udt_definition_tags_writeLevel_check" CHECK("writeLevel" in ('operator', 'engineer', 'admin'))
);
--> statement-breakpoint
CREATE TABLE `udt_definitions` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`props` text NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_permissions` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`action` text NOT NULL,
	`subject` text NOT NULL,
	`conditions` text,
	`fields` text,
	`inverted` integer DEFAULT false NOT NULL,
	`reason` text,
	CONSTRAINT `fk_user_permissions_userId_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT "user_permissions_action_check" CHECK("action" in ('read', 'create', 'update', 'delete', 'manage', 'write')),
	CONSTRAINT "user_permissions_subject_check" CHECK("subject" in ('all', 'User', 'Project', 'Page', 'Element', 'UserComponent', 'Device', 'Tag', 'UdtDefinition', 'TagFolder', 'TagValue', 'Trend'))
);
--> statement-breakpoint
INSERT INTO `__new_user_permissions`(`id`, `userId`, `action`, `subject`, `conditions`, `fields`, `inverted`, `reason`) SELECT `id`, `userId`, `action`, `subject`, `conditions`, `fields`, `inverted`, `reason` FROM `user_permissions`;--> statement-breakpoint
DROP TABLE `user_permissions`;--> statement-breakpoint
ALTER TABLE `__new_user_permissions` RENAME TO `user_permissions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `user_permissions_user_idx` ON `user_permissions` (`userId`);