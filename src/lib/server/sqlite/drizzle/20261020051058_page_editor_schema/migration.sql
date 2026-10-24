CREATE TABLE `elements` (
	`id` text PRIMARY KEY,
	`pageId` text,
	`userComponentId` text,
	`parentId` text,
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
	CONSTRAINT `fk_elements_parentId_elements_id_fk` FOREIGN KEY (`parentId`) REFERENCES `elements`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_elements_referencedComponentId_user_components_id_fk` FOREIGN KEY (`referencedComponentId`) REFERENCES `user_components`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "elements_owner_check" CHECK((("pageId" IS NOT NULL) + ("userComponentId" IS NOT NULL)) = 1),
	CONSTRAINT "elements_kind_check" CHECK((
        ("kind" IN ('html', 'svg') AND "tag" IS NOT NULL AND "baseComponent" IS NULL AND "referencedComponentId" IS NULL)
        OR ("kind" = 'base-component' AND "tag" IS NULL AND "baseComponent" IS NOT NULL AND "referencedComponentId" IS NULL)
        OR ("kind" = 'user-component' AND "tag" IS NULL AND "baseComponent" IS NULL AND "referencedComponentId" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE `page_paths` (
	`parent` text NOT NULL,
	`child` text NOT NULL,
	`depth` integer NOT NULL,
	CONSTRAINT `page_paths_pk` PRIMARY KEY(`parent`, `child`),
	CONSTRAINT `fk_page_paths_parent_pages_id_fk` FOREIGN KEY (`parent`) REFERENCES `pages`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_page_paths_child_pages_id_fk` FOREIGN KEY (`child`) REFERENCES `pages`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY,
	`projectId` text NOT NULL,
	`name` text NOT NULL,
	`containerType` text DEFAULT 'absolute' NOT NULL,
	`sortIndex` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_pages_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`version` text DEFAULT '0.0.0' NOT NULL,
	`description` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_components` (
	`id` text PRIMARY KEY,
	`projectId` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`props` text DEFAULT '[]' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_user_components_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `elements_page_idx` ON `elements` (`pageId`);--> statement-breakpoint
CREATE INDEX `elements_user_component_idx` ON `elements` (`userComponentId`);--> statement-breakpoint
CREATE INDEX `elements_parent_idx` ON `elements` (`parentId`);--> statement-breakpoint
CREATE INDEX `elements_referenced_component_idx` ON `elements` (`referencedComponentId`);--> statement-breakpoint
CREATE INDEX `pages_project_idx` ON `pages` (`projectId`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_components_project_name_unique` ON `user_components` (`projectId`,`name`);