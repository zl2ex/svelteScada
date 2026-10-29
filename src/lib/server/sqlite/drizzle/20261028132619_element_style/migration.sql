ALTER TABLE `elements` ADD `style` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE `elements`
SET `style` = json_extract(`attributes`, '$.style')
WHERE json_valid(`attributes`)
	AND json_type(`attributes`, '$.style') = 'object';--> statement-breakpoint
UPDATE `elements`
SET `attributes` = json_remove(`attributes`, '$.style')
WHERE json_valid(`attributes`);