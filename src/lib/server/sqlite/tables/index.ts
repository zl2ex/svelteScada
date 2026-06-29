import { user } from "./user";
import { tag, z_insertTag } from "./tag";
import { devices } from "./devices";
import { displays } from "./displays";
import { user_permissions } from "./user-permissions";
import { tag_folders } from "./tag-folders";
import { tag_folder_paths } from "./tag-folder-paths";

export {
  user,
  user_permissions,
  tag,
  devices,
  displays,
  tag_folders,
  tag_folder_paths,
};

export const tables = {
  user,
  user_permissions,
  tag,
  devices,
  displays,
  tag_folders,
  tag_folder_paths,
} as const;

export type { User } from "./user";
export type { UserPermissions } from "./user-permissions";
export type { TagSelect } from "./tag";
export type { Device } from "./devices";
export type { Display } from "./displays";
export type { TagFolder } from "./tag-folders";
export type { TagFolderPaths } from "./tag-folder-paths";

export { z_insertUser } from "./user";
export { z_insertUserPermissions } from "./user-permissions";
export { z_insertTag } from "./tag";
export { z_insertTagFolder } from "./tag-folders";
export { z_insertTagFolderPaths } from "./tag-folder-paths";
