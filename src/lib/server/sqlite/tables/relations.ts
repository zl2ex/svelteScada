import { defineRelations } from "drizzle-orm";
import * as schema from "./index";

export const relationsConfig = defineRelations(schema, (r) => ({
  user: {
    permissions: r.one.user_permissions({
      from: r.user.permissionsFk,
      to: r.user_permissions.id,
    }),
  },

  user_permissions: {
    users: r.many.user({
      from: r.user_permissions.id,
      to: r.user.permissionsFk,
    }),
  },

  tag_folders: {
    descendantPaths: r.many.tag_folder_paths({
      from: r.tag_folders.id,
      to: r.tag_folder_paths.ancestor,
    }),
    ancestorPaths: r.many.tag_folder_paths({
      from: r.tag_folders.id,
      to: r.tag_folder_paths.descendant,
    }),
    tags: r.many.tag({
      from: r.tag_folders.id,
      to: r.tag.folderId,
    }),
  },

  tag_folder_paths: {
    ancestorFolder: r.one.tag_folders({
      from: r.tag_folder_paths.ancestor,
      to: r.tag_folders.id,
    }),
    descendantFolder: r.one.tag_folders({
      from: r.tag_folder_paths.descendant,
      to: r.tag_folders.id,
    }),
  },

  tag: {
    folder: r.one.tag_folders({
      from: r.tag.folderId,
      to: r.tag_folders.id,
    }),
  },
}));
