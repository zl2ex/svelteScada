ALTER TABLE `trends` RENAME COLUMN `ok` TO `statusCode`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_device_opcua_client_options` (
	`deviceId` text PRIMARY KEY,
	`endpointUrl` text DEFAULT 'opc.tcp://url:4840' NOT NULL,
	`samplingIntervalMs` integer DEFAULT 1000 NOT NULL,
	`queueSize` integer DEFAULT 10 NOT NULL,
	`deadbandValue` real DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_device_opcua_client_options_deviceId_devices_id_fk` FOREIGN KEY (`deviceId`) REFERENCES `devices`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_device_opcua_client_options`(`deviceId`, `endpointUrl`, `samplingIntervalMs`, `queueSize`, `deadbandValue`) SELECT `deviceId`, `endpointUrl`, `samplingIntervalMs`, `queueSize`, `deadbandValue` FROM `device_opcua_client_options`;--> statement-breakpoint
DROP TABLE `device_opcua_client_options`;--> statement-breakpoint
ALTER TABLE `__new_device_opcua_client_options` RENAME TO `device_opcua_client_options`;--> statement-breakpoint
PRAGMA foreign_keys=ON;