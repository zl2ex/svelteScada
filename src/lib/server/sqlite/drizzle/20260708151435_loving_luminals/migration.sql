CREATE TABLE `device_modbus_rtu_options` (
	`deviceId` text PRIMARY KEY,
	`serialPort` text DEFAULT '' NOT NULL,
	`baudRate` integer DEFAULT 9600 NOT NULL,
	`parity` text DEFAULT 'none' NOT NULL,
	`unitId` integer DEFAULT 1 NOT NULL,
	`spanGaps` integer DEFAULT false NOT NULL,
	`pollingIntervalMs` integer DEFAULT 1000 NOT NULL,
	`startAddress` real DEFAULT 0 NOT NULL,
	`endian` text DEFAULT 'LittleEndian' NOT NULL,
	CONSTRAINT `fk_device_modbus_rtu_options_deviceId_devices_id_fk` FOREIGN KEY (`deviceId`) REFERENCES `devices`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `device_modbus_tcp_options` (
	`deviceId` text PRIMARY KEY,
	`ip` text DEFAULT '127.0.0.1' NOT NULL,
	`port` integer DEFAULT 502 NOT NULL,
	`unitId` integer DEFAULT 1 NOT NULL,
	`pollingIntervalMs` integer DEFAULT 1000 NOT NULL,
	`spanGaps` integer DEFAULT false NOT NULL,
	`reconnectInervalMs` real DEFAULT 5000 NOT NULL,
	`startAddress` real DEFAULT 0 NOT NULL,
	`endian` text DEFAULT 'LittleEndian' NOT NULL,
	`swapWords` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_device_modbus_tcp_options_deviceId_devices_id_fk` FOREIGN KEY (`deviceId`) REFERENCES `devices`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `device_opcua_client_options` (
	`deviceId` text PRIMARY KEY,
	`endpointUrl` text DEFAULT 'opc.tcp://localhost:4840' NOT NULL,
	CONSTRAINT `fk_device_opcua_client_options_deviceId_devices_id_fk` FOREIGN KEY (`deviceId`) REFERENCES `devices`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `tag` RENAME TO `tags`;--> statement-breakpoint
ALTER TABLE `user` RENAME TO `users`;--> statement-breakpoint
ALTER TABLE `devices` ADD `driverName` text NOT NULL;--> statement-breakpoint
ALTER TABLE `devices` ADD `displayName` text NOT NULL;--> statement-breakpoint
ALTER TABLE `devices` ADD `enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_devices` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`driverName` text NOT NULL,
	`displayName` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_devices`(`id`, `name`) SELECT `id`, `name` FROM `devices`;--> statement-breakpoint
DROP TABLE `devices`;--> statement-breakpoint
ALTER TABLE `__new_devices` RENAME TO `devices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;