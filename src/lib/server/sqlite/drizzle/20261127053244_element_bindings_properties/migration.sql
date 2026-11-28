UPDATE `elements`
SET `bindings` = json_remove(
	json_set(`bindings`, '$.properties', json_extract(`bindings`, '$.props')),
	'$.props'
)
WHERE `bindings` IS NOT NULL
	AND json_valid(`bindings`)
	AND json_type(`bindings`, '$.props') = 'object';
