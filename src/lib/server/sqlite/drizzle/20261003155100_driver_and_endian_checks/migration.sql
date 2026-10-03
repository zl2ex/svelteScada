PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_device_modbus_rtu_options` (
	`deviceId` text PRIMARY KEY,
	`serialPort` text DEFAULT '' NOT NULL,
	`baudRate` integer DEFAULT 9600 NOT NULL,
	`parity` text DEFAULT 'none' NOT NULL,
	`unitId` integer DEFAULT 1 NOT NULL,
	`spanGaps` integer DEFAULT false NOT NULL,
	`pollingIntervalMs` integer DEFAULT 1000 NOT NULL,
	`startAddress` real DEFAULT 0 NOT NULL,
	`endian` text DEFAULT 'LittleEndian' NOT NULL,
	`swapWords` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_device_modbus_rtu_options_deviceId_devices_id_fk` FOREIGN KEY (`deviceId`) REFERENCES `devices`(`id`) ON DELETE CASCADE,
	CONSTRAINT "device_modbus_rtu_options_endian_check" CHECK("endian" in ('BigEndian', 'LittleEndian'))
);
--> statement-breakpoint
INSERT INTO `__new_device_modbus_rtu_options`(`deviceId`, `serialPort`, `baudRate`, `parity`, `unitId`, `spanGaps`, `pollingIntervalMs`, `startAddress`, `endian`, `swapWords`) SELECT `deviceId`, `serialPort`, `baudRate`, `parity`, `unitId`, `spanGaps`, `pollingIntervalMs`, `startAddress`, `endian`, `swapWords` FROM `device_modbus_rtu_options`;--> statement-breakpoint
DROP TABLE `device_modbus_rtu_options`;--> statement-breakpoint
ALTER TABLE `__new_device_modbus_rtu_options` RENAME TO `device_modbus_rtu_options`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_device_modbus_tcp_options` (
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
	CONSTRAINT `fk_device_modbus_tcp_options_deviceId_devices_id_fk` FOREIGN KEY (`deviceId`) REFERENCES `devices`(`id`) ON DELETE CASCADE,
	CONSTRAINT "device_modbus_tcp_options_endian_check" CHECK("endian" in ('BigEndian', 'LittleEndian'))
);
--> statement-breakpoint
INSERT INTO `__new_device_modbus_tcp_options`(`deviceId`, `ip`, `port`, `unitId`, `pollingIntervalMs`, `spanGaps`, `reconnectInervalMs`, `startAddress`, `endian`, `swapWords`) SELECT `deviceId`, `ip`, `port`, `unitId`, `pollingIntervalMs`, `spanGaps`, `reconnectInervalMs`, `startAddress`, `endian`, `swapWords` FROM `device_modbus_tcp_options`;--> statement-breakpoint
DROP TABLE `device_modbus_tcp_options`;--> statement-breakpoint
ALTER TABLE `__new_device_modbus_tcp_options` RENAME TO `device_modbus_tcp_options`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_devices` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`driverName` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	CONSTRAINT "devices_driverName_check" CHECK("driverName" in ('ModbusTCPDriver', 'ModbusRTUDriver', 'opcuaClientDriver'))
);
--> statement-breakpoint
INSERT INTO `__new_devices`(`id`, `name`, `driverName`, `enabled`) SELECT `id`, `name`, `driverName`, `enabled` FROM `devices`;--> statement-breakpoint
DROP TABLE `devices`;--> statement-breakpoint
ALTER TABLE `__new_devices` RENAME TO `devices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;