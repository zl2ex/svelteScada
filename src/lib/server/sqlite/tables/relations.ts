import { defineRelations } from "drizzle-orm";
import * as schema from "./index";

export const relationsConfig = defineRelations(schema, (r) => ({
  user: {
    permissions: r.one.user_permissions({
      from: r.user.id,
      to: r.user_permissions.id,
    }),
  },

  user_permissions: {
    users: r.one.user({
      from: r.user_permissions.id,
      to: r.user.id,
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
    tags: r.many.tag({
      from: r.tag_folders.id,
      to: r.tag.folderId,
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

  tag: {
    folder: r.one.tag_folders({
      from: r.tag.folderId,
      to: r.tag_folders.id,
    }),
  },
}));
