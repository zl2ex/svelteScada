import { defineRelations } from "drizzle-orm";
import * as schema from "./index";

export const relationsConfig = defineRelations(schema, (r) => ({
  users: {
    permissions: r.one.user_permissions({
      from: r.users.id,
      to: r.user_permissions.id,
    }),
  },

  user_permissions: {
    users: r.one.users({
      from: r.user_permissions.id,
      to: r.users.id,
    }),
  },

  tag_folders: {
    childPaths: r.many.tag_folder_paths({
      from: r.tag_folders.id,
      to: r.tag_folder_paths.parent,
    }),
    parentPaths: r.many.tag_folder_paths({
      from: r.tag_folders.id,
      to: r.tag_folder_paths.child,
    }),
    tags: r.many.tags({
      from: r.tag_folders.id,
      to: r.tags.folderId,
    }),
  },

  tag_folder_paths: {
    parentFolder: r.one.tag_folders({
      from: r.tag_folder_paths.parent,
      to: r.tag_folders.id,
    }),
    childFolder: r.one.tag_folders({
      from: r.tag_folder_paths.child,
      to: r.tag_folders.id,
    }),
  },

  tags: {
    folder: r.one.tag_folders({
      from: r.tags.folderId,
      to: r.tag_folders.id,
    }),
  },

  devices: {
    device_modbus_tcp_options: r.one.device_modbus_tcp_options({
      from: r.devices.id,
      to: r.device_modbus_tcp_options.deviceId,
    }),
    device_modbus_rtu_options: r.one.device_modbus_rtu_options({
      from: r.devices.id,
      to: r.device_modbus_rtu_options.deviceId,
    }),
    device_opcua_client_options: r.one.device_opcua_client_options({
      from: r.devices.id,
      to: r.device_opcua_client_options.deviceId,
    }),
  },
}));
