ALTER TABLE `tag_trend_options` RENAME COLUMN `interval` TO `minimumIntervalMs`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tag_trend_options` (
	`tagId` text PRIMARY KEY,
	`minimumIntervalMs` integer DEFAULT 100 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	CONSTRAINT `fk_tag_trend_options_tagId_tags_id_fk` FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_tag_trend_options`(`tagId`, `minimumIntervalMs`, `enabled`) SELECT `tagId`, `minimumIntervalMs`, `enabled` FROM `tag_trend_options`;--> statement-breakpoint
DROP TABLE `tag_trend_options`;--> statement-breakpoint
ALTER TABLE `__new_tag_trend_options` RENAME TO `tag_trend_options`;--> statement-breakpoint
PRAGMA foreign_keys=ON;