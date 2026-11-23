ALTER TABLE `elements` ADD `properties` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE `elements`
SET `properties` = (
	SELECT json_group_object(j.key, json_object('value', j.value, 'required', json('false')))
	FROM json_each(`elements`.`attributes`) AS j
)
WHERE `kind` IN ('base-component', 'user-component')
	AND json_valid(`attributes`)
	AND json_type(`attributes`) = 'object';--> statement-breakpoint
UPDATE `elements`
SET `attributes` = '{}'
WHERE `kind` IN ('base-component', 'user-component')
	AND json_valid(`attributes`);--> statement-breakpoint
UPDATE `tags`
SET `properties` = (
	SELECT json_group_object(j.key, json_object('value', j.value, 'required', json('false')))
	FROM json_each(`tags`.`properties`) AS j
)
WHERE `properties` IS NOT NULL
	AND json_valid(`properties`)
	AND json_type(`properties`) = 'object';--> statement-breakpoint
UPDATE `udt_definitions`
SET `properties` = (
	SELECT json_group_object(j.key, json_object('value', j.value, 'required', json('false')))
	FROM json_each(`udt_definitions`.`properties`) AS j
)
WHERE json_valid(`properties`)
	AND json_type(`properties`) = 'object';--> statement-breakpoint
UPDATE `udt_definitions`
SET `children` = (
	SELECT json_group_array(
		CASE
			WHEN json_type(j.value, '$.properties') = 'object' THEN
				json_set(
					j.value,
					'$.properties',
					(
						SELECT json_group_object(p.key, json_object('value', p.value, 'required', json('false')))
						FROM json_each(json_extract(j.value, '$.properties')) AS p
					)
				)
			ELSE j.value
		END
	)
	FROM json_each(`udt_definitions`.`children`) AS j
)
WHERE json_valid(`children`);--> statement-breakpoint
UPDATE `tags`
SET `udtOverrides` = json_set(
	`udtOverrides`,
	'$.properties',
	(
		SELECT json_group_object(p.key, json_object('value', p.value, 'required', json('false')))
		FROM json_each(json_extract(`tags`.`udtOverrides`, '$.properties')) AS p
	)
)
WHERE `udtOverrides` IS NOT NULL
	AND json_valid(`udtOverrides`)
	AND json_type(`udtOverrides`, '$.properties') = 'object';--> statement-breakpoint
UPDATE `user_components`
SET `props` = (
	SELECT json_group_array(
		CASE
			WHEN json_extract(j.value, '$.defaultValue') IS NOT NULL THEN
				json_set(
					j.value,
					'$.defaultValue',
					json_object(
						'value',
						json_extract(j.value, '$.defaultValue'),
						'required',
						COALESCE(json_extract(j.value, '$.required'), json('true'))
					)
				)
			ELSE j.value
		END
	)
	FROM json_each(`user_components`.`props`) AS j
)
WHERE json_valid(`props`);
