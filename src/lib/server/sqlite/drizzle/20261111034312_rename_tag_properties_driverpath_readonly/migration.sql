ALTER TABLE `udt_definitions` RENAME COLUMN `props` TO `properties`;
--> statement-breakpoint
ALTER TABLE `tags` RENAME COLUMN `parameters` TO `properties`;
--> statement-breakpoint
ALTER TABLE `tags` RENAME COLUMN `nodeId` TO `driverPath`;
--> statement-breakpoint
ALTER TABLE `tags` RENAME COLUMN `writeable` TO `readonly`;
--> statement-breakpoint
UPDATE `tags`
SET `readonly` = CASE
	WHEN `readonly` = 1 THEN 0
	WHEN `readonly` = 0 THEN 1
	ELSE 0
END;
