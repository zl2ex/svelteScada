CREATE TABLE `element_paths` (
	`parent` text NOT NULL,
	`child` text NOT NULL,
	`depth` integer NOT NULL,
	CONSTRAINT `element_paths_pk` PRIMARY KEY(`parent`, `child`),
	CONSTRAINT `fk_element_paths_parent_elements_id_fk` FOREIGN KEY (`parent`) REFERENCES `elements`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_element_paths_child_elements_id_fk` FOREIGN KEY (`child`) REFERENCES `elements`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TEMP TABLE `element_parents` AS SELECT `id`, `parentId` FROM `elements`;--> statement-breakpoint
WITH RECURSIVE `page_tree` (`id`, `projectId`, `baseName`) AS (
	SELECT `id`, `projectId`, `name`
	FROM `pages`
	WHERE NOT EXISTS (
		SELECT 1 FROM `page_paths` WHERE `page_paths`.`child` = `pages`.`id` AND `page_paths`.`depth` = 1
	)
	UNION ALL
	SELECT `pages`.`id`, `pages`.`projectId`, `page_tree`.`baseName` || '-' || `pages`.`name`
	FROM `pages`
	JOIN `page_paths` ON `page_paths`.`child` = `pages`.`id` AND `page_paths`.`depth` = 1
	JOIN `page_tree` ON `page_paths`.`parent` = `page_tree`.`id`
),
`ranked_pages` AS (
	SELECT `id`, `baseName`, ROW_NUMBER() OVER (
		PARTITION BY `projectId`, `baseName` ORDER BY `id`
	) AS `rowNumber`
	FROM `page_tree`
)
UPDATE `pages`
SET `name` = (
	SELECT CASE
		WHEN `rowNumber` = 1 THEN `baseName`
		ELSE `baseName` || '-' || `rowNumber`
	END
	FROM `ranked_pages`
	WHERE `ranked_pages`.`id` = `pages`.`id`
)
WHERE `id` IN (SELECT `id` FROM `ranked_pages`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_elements` (
	`id` text PRIMARY KEY,
	`pageId` text,
	`userComponentId` text,
	`sortIndex` integer DEFAULT 0 NOT NULL,
	`kind` text NOT NULL,
	`tag` text,
	`baseComponent` text,
	`referencedComponentId` text,
	`name` text DEFAULT '' NOT NULL,
	`text` text,
	`containerType` text DEFAULT 'none' NOT NULL,
	`attributes` text DEFAULT '{}' NOT NULL,
	`style` text DEFAULT '{}' NOT NULL,
	`bindings` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_elements_pageId_pages_id_fk` FOREIGN KEY (`pageId`) REFERENCES `pages`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_elements_userComponentId_user_components_id_fk` FOREIGN KEY (`userComponentId`) REFERENCES `user_components`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_elements_referencedComponentId_user_components_id_fk` FOREIGN KEY (`referencedComponentId`) REFERENCES `user_components`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "elements_owner_check" CHECK((("pageId" IS NOT NULL) + ("userComponentId" IS NOT NULL)) = 1),
	CONSTRAINT "elements_kind_check" CHECK((
        ("kind" IN ('html', 'svg') AND "tag" IS NOT NULL AND "baseComponent" IS NULL AND "referencedComponentId" IS NULL)
        OR ("kind" = 'base-component' AND "tag" IS NULL AND "baseComponent" IS NOT NULL AND "referencedComponentId" IS NULL)
        OR ("kind" = 'user-component' AND "tag" IS NULL AND "baseComponent" IS NULL AND "referencedComponentId" IS NOT NULL)
      ))
);
--> statement-breakpoint
INSERT INTO `__new_elements`(`id`, `pageId`, `userComponentId`, `sortIndex`, `kind`, `tag`, `baseComponent`, `referencedComponentId`, `name`, `text`, `containerType`, `attributes`, `style`, `bindings`, `createdAt`, `updatedAt`) SELECT `id`, `pageId`, `userComponentId`, `sortIndex`, `kind`, `tag`, `baseComponent`, `referencedComponentId`, `name`, `text`, `containerType`, `attributes`, `style`, `bindings`, `createdAt`, `updatedAt` FROM `elements`;--> statement-breakpoint
DROP TABLE `elements`;--> statement-breakpoint
ALTER TABLE `__new_elements` RENAME TO `elements`;--> statement-breakpoint
INSERT INTO `element_paths` (`parent`, `child`, `depth`)
WITH RECURSIVE `element_ancestors` (`parent`, `child`, `depth`) AS (
	SELECT `id`, `id`, 0 FROM `element_parents`
	UNION ALL
	SELECT `element_ancestors`.`parent`, `element_parents`.`id`, `element_ancestors`.`depth` + 1
	FROM `element_ancestors`
	JOIN `element_parents` ON `element_parents`.`parentId` = `element_ancestors`.`child`
)
SELECT `parent`, `child`, `depth` FROM `element_ancestors`;--> statement-breakpoint
DROP TABLE `element_parents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `elements_parent_idx`;--> statement-breakpoint
CREATE INDEX `elements_page_idx` ON `elements` (`pageId`);--> statement-breakpoint
CREATE INDEX `elements_user_component_idx` ON `elements` (`userComponentId`);--> statement-breakpoint
CREATE INDEX `elements_referenced_component_idx` ON `elements` (`referencedComponentId`);--> statement-breakpoint
CREATE UNIQUE INDEX `pages_project_name_unique` ON `pages` (`projectId`,`name`);--> statement-breakpoint
DROP TABLE `page_paths`;