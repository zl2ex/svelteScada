ALTER TABLE `tag` ADD `parameters` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_permissions` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`read` integer DEFAULT false,
	`write` integer DEFAULT false,
	`edit` integer DEFAULT false,
	CONSTRAINT `fk_user_permissions_userId_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_user_permissions`(`id`, `userId`, `read`, `write`, `edit`) SELECT `id`, `userId`, `read`, `write`, `edit` FROM `user_permissions`;--> statement-breakpoint
DROP TABLE `user_permissions`;--> statement-breakpoint
ALTER TABLE `__new_user_permissions` RENAME TO `user_permissions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;