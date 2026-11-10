ALTER TABLE `udt_definitions` ADD `children` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `tags` ADD `parentTagId` text REFERENCES tags(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `tags` ADD `udtDefinitionId` text;
--> statement-breakpoint
ALTER TABLE `tags` ADD `udtDefinitionChildId` text;
--> statement-breakpoint
ALTER TABLE `tags` ADD `udtOverrides` text;
--> statement-breakpoint
DROP TABLE `udt_definition_tags`;
--> statement-breakpoint
ALTER TABLE `tags` DROP COLUMN `children`;
