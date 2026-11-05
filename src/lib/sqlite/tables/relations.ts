import { defineRelations } from "drizzle-orm";
import * as schema from "./index";

export const relationsConfig = defineRelations(schema, (r) => ({
  projects: {
    theme: r.one.user_theme({
      from: r.projects.themeId,
      to: r.user_theme.id,
    }),
    pages: r.many.pages({
      from: r.projects.id,
      to: r.pages.projectId,
    }),
    userComponents: r.many.user_components({
      from: r.projects.id,
      to: r.user_components.projectId,
    }),
  },

  user_theme: {
    projects: r.many.projects({
      from: r.user_theme.id,
      to: r.projects.themeId,
    }),
  },

  pages: {
    project: r.one.projects({
      from: r.pages.projectId,
      to: r.projects.id,
    }),
    elements: r.many.elements({
      from: r.pages.id,
      to: r.elements.pageId,
    }),
  },

  elements: {
    childPaths: r.many.element_paths({
      from: r.elements.id,
      to: r.element_paths.parent,
    }),
    parentPaths: r.many.element_paths({
      from: r.elements.id,
      to: r.element_paths.child,
    }),
  },

  element_paths: {
    parentElement: r.one.elements({
      from: r.element_paths.parent,
      to: r.elements.id,
    }),
    childElement: r.one.elements({
      from: r.element_paths.child,
      to: r.elements.id,
    }),
  },

  user_components: {
    project: r.one.projects({
      from: r.user_components.projectId,
      to: r.projects.id,
    }),
    elements: r.many.elements({
      from: r.user_components.id,
      to: r.elements.userComponentId,
    }),
  },

  users: {
    permissions: r.many.user_permissions({
      from: r.users.id,
      to: r.user_permissions.userId,
    }),
  },

  user_permissions: {
    user: r.one.users({
      from: r.user_permissions.userId,
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
