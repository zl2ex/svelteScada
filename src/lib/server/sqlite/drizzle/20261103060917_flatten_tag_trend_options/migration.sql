ALTER TABLE `tags` ADD `trend_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tags` ADD `trend_minimumSamplingIntervalMs` integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
UPDATE `tags`
SET `trend_enabled` = (
  SELECT `enabled` FROM `tag_trend_options` WHERE `tag_trend_options`.`tagId` = `tags`.`id`
),
`trend_minimumSamplingIntervalMs` = (
  SELECT `minimumIntervalMs` FROM `tag_trend_options` WHERE `tag_trend_options`.`tagId` = `tags`.`id`
)
WHERE EXISTS (
  SELECT 1 FROM `tag_trend_options` WHERE `tag_trend_options`.`tagId` = `tags`.`id`
);--> statement-breakpoint
DROP TABLE `tag_trend_options`;