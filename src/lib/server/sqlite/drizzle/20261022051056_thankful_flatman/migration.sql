UPDATE `elements`
SET `attributes` = CASE
	WHEN `style` IS NULL OR trim(`style`) = '' OR trim(`style`) = '{}' THEN `attributes`
	ELSE json_set(
		CASE WHEN `attributes` IS NULL OR trim(`attributes`) = '' THEN '{}' ELSE `attributes` END,
		'$.style',
		json(`style`)
	)
END;--> statement-breakpoint
ALTER TABLE `elements` DROP COLUMN `style`;
