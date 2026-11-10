UPDATE `tags`
SET `udtDefinitionId` = (
	SELECT `udt_definitions`.`id`
	FROM `udt_definitions`
	WHERE `udt_definitions`.`name` = `tags`.`dataType`
)
WHERE EXISTS (
	SELECT 1
	FROM `udt_definitions`
	WHERE `udt_definitions`.`name` = `tags`.`dataType`
);
--> statement-breakpoint
UPDATE `tags`
SET `udtDefinitionId` = NULL
WHERE `dataType` NOT IN (SELECT `name` FROM `udt_definitions`);
--> statement-breakpoint
ALTER TABLE `tags` DROP COLUMN `type`;
