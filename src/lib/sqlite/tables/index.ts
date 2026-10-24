import { users } from "./users";
import { tags } from "./tags";
import { devices } from "./devices";
import { projects } from "./projects";
import { pages } from "./pages";
import { elements } from "./elements";
import { element_paths } from "./element_paths";
import { user_components } from "./user_components";
import { user_permissions } from "./user_permissions";
import { tag_folders } from "./tag_folders";
import { tag_folder_paths } from "./tag_folder_paths";
import { device_modbus_tcp_options } from "./device_modbus_tcp_options";
import { device_modbus_rtu_options } from "./device_modbus_rtu_options";
import { device_opcua_client_options } from "./device_opcua_client_options";
import { tag_trend_options } from "./tag_trend_options";
import { trends } from "./trends";

export {
  users,
  user_permissions,
  tags,
  devices,
  projects,
  pages,
  element_paths,
  elements,
  user_components,
  tag_folders,
  tag_folder_paths,
  device_modbus_tcp_options,
  device_modbus_rtu_options,
  device_opcua_client_options,
  tag_trend_options,
  trends,
};

export const tables = {
  users,
  user_permissions,
  tags,
  devices,
  projects,
  pages,
  element_paths,
  elements,
  user_components,
  tag_folders,
  tag_folder_paths,
  device_modbus_tcp_options,
  device_modbus_rtu_options,
  device_opcua_client_options,
  tag_trend_options,
  trends,
} as const;

export type { UserSelect, UserInsert } from "./users";
export type { UserPermissionSelect, UserPermissionInsert } from "./user_permissions";
export type { TagSelect, TagInsert } from "./tags";
export type { DeviceSelect, DeviceInsert } from "./devices";
export type { ProjectSelect, ProjectInsert } from "./projects";
export type { PageSelect, PageInsert } from "./pages";
export type { ElementPathSelect, ElementPathInsert } from "./element_paths";
export type { ElementSelect, ElementInsert } from "./elements";
export type { UserComponentSelect, UserComponentInsert } from "./user_components";
export type { TagFolderSelect, TagFolderInsert } from "./tag_folders";
export type { TagFolderPathSelect, TagFolderPathInsert } from "./tag_folder_paths";
export type {
  DeviceModbusTcpOptionsSelect,
  DeviceModbusTcpOptionsInsert,
  DeviceModbusTcpOptionsConfig,
} from "./device_modbus_tcp_options";
export type {
  DeviceModbusRtuOptionsSelect,
  DeviceModbusRtuOptionsInsert,
  DeviceModbusRtuOptionsConfig,
} from "./device_modbus_rtu_options";
export type {
  DeviceOpcuaClientOptionsSelect,
  DeviceOpcuaClientOptionsInsert,
  DeviceOpcuaClientOptionsConfig,
} from "./device_opcua_client_options";
export type { TagTrendOptionsSelect, TagTrendOptionsInsert } from "./tag_trend_options";
export type { TrendSelect, TrendInsert } from "./trends";

export { z_UserSelect, z_UserInsert, z_UserLogin } from "./users";
export { z_UserPermissionSelect, z_UserPermissionInsert } from "./user_permissions";
export { z_TagSelect, z_TagInsert } from "./tags";
export { z_DeviceSelect, z_DeviceInsert } from "./devices";
export { z_ProjectSelect, z_ProjectInsert } from "./projects";
export { z_PageSelect, z_PageInsert } from "./pages";
export { z_ElementPathSelect, z_ElementPathInsert } from "./element_paths";
export { z_ElementSelect, z_ElementInsert } from "./elements";
export { z_UserComponentSelect, z_UserComponentInsert } from "./user_components";
export { z_TagFolderSelect, z_TagFolderInsert, z_TagFolderNodeInsert } from "./tag_folders";
export { z_TagFolderPathSelect, z_TagFolderPathInsert } from "./tag_folder_paths";
export {
  z_DeviceModbusTcpOptionsSelect,
  z_DeviceModbusTcpOptionsInsert,
} from "./device_modbus_tcp_options";
export {
  z_DeviceModbusRtuOptionsSelect,
  z_DeviceModbusRtuOptionsInsert,
} from "./device_modbus_rtu_options";
export {
  z_DeviceOpcuaClientOptionsSelect,
  z_DeviceOpcuaClientOptionsInsert,
} from "./device_opcua_client_options";
export { z_TagTrendOptionsSelect, z_TagTrendOptionsInsert } from "./tag_trend_options";
export { z_TrendSelect, z_TrendInsert } from "./trends";

export { driverNames } from "./devices";
export type { DriverName } from "./devices";
export { endianNames, parityNames } from "./enums";
