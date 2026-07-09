import { users } from "./users";
import { tags, z_insertTag } from "./tags";
import { devices } from "./devices";
import { displays } from "./displays";
import { user_permissions } from "./user_permissions";
import { tag_folders } from "./tag_folders";
import { tag_folder_paths } from "./tag_folder_paths";
import { device_modbus_tcp_options } from "./device_modbus_tcp_options";
import { device_modbus_rtu_options } from "./device_modbus_rtu_options";
import { device_opcua_client_options } from "./device_opcua_client_options";

export {
  users,
  user_permissions,
  tags,
  devices,
  displays,
  tag_folders,
  tag_folder_paths,
  device_modbus_tcp_options,
  device_modbus_rtu_options,
  device_opcua_client_options,
};

export const tables = {
  users,
  user_permissions,
  tags,
  devices,
  displays,
  tag_folders,
  tag_folder_paths,
  device_modbus_tcp_options,
  device_modbus_rtu_options,
  device_opcua_client_options,
} as const;

export type { UserSelect } from "./users";
export type { UserPermissionsSelect } from "./user_permissions";
export type { TagSelect } from "./tags";
export type { DeviceSelect } from "./devices";
export type { DisplaySelect } from "./displays";
export type { TagFolderSelect } from "./tag_folders";
export type { TagFolderPathsSelect } from "./tag_folder_paths";
export type { DeviceModbusTcpOptionsSelect } from "./device_modbus_tcp_options";
export type { DeviceModbusRtuOptionsSelect } from "./device_modbus_rtu_options";
export type { DeviceOpcuaClientOptionsSelect } from "./device_opcua_client_options";

export type { UserInsert } from "./users";
export type { UserPermissionsInsert } from "./user_permissions";
export type { TagInsert } from "./tags";
export type { DeviceInsert } from "./devices";
export type { DisplayInsert } from "./displays";
export type { TagFolderInsert } from "./tag_folders";
export type { TagFolderPathsInsert } from "./tag_folder_paths";
export type { DeviceModbusTcpOptionsInsert } from "./device_modbus_tcp_options";
export type { DeviceModbusRtuOptionsInsert } from "./device_modbus_rtu_options";
export type { DeviceOpcuaClientOptionsInsert } from "./device_opcua_client_options";

export { z_insertUser } from "./users";
export { z_insertUserPermissions } from "./user_permissions";
export { z_insertTag } from "./tags";
export { z_insertDevice } from "./devices";
export { z_insertDisplay } from "./displays";
export { z_insertTagFolder } from "./tag_folders";
export { z_insertTagFolderPaths } from "./tag_folder_paths";
export { z_insertDeviceModbusTcpOptions } from "./device_modbus_tcp_options";
export { z_insertDeviceModbusRtuOptions } from "./device_modbus_rtu_options";
export { z_insertDeviceOpcuaClientOptions } from "./device_opcua_client_options";

export { z_loginUser } from "./users";
