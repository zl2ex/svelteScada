ALTER TABLE `device_opcua_client_options` ADD `samplingIntervalMs` integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE `device_opcua_client_options` ADD `queueSize` integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `device_opcua_client_options` ADD `deadbandValue` real DEFAULT 0 NOT NULL;