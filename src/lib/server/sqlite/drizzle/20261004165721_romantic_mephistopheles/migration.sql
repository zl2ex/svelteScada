CREATE TABLE `tag_trend_options` (
	`tagId` text PRIMARY KEY,
	`interval` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	CONSTRAINT `fk_tag_trend_options_tagId_tags_id_fk` FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `trends` (
	`timestamp` integer NOT NULL,
	`tagId` text NOT NULL,
	`value` text NOT NULL,
	`ok` integer NOT NULL,
	CONSTRAINT `trends_pk` PRIMARY KEY(`tagId`, `timestamp`),
	CONSTRAINT `fk_trends_tagId_tags_id_fk` FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON DELETE CASCADE
);
