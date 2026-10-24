import { inArray } from "drizzle-orm";
import { tag_folders, tag_folder_paths, tags, type TagFolderSelect } from "$lib/sqlite/tables";
import {
  ClosureTable,
  type ClosureTableNode as GenericClosureTableNode,
  type ClosureTableNodeWithPath as GenericClosureTableNodeWithPath,
} from "./closureTable";

export type ClosureTableNode = TagFolderSelect & {
  parentId: string | null;
};

export type ClosureTableNodeWithPath = ClosureTableNode & { path: string };

export { ClosureTable };

export const tagFoldersClosureTable = new ClosureTable<
  TagFolderSelect,
  { parent: string; child: string; depth: number }
>({
  items: tag_folders,
  paths: tag_folder_paths,
  onCascadeDelete: (tx, ids) => {
    tx.delete(tags).where(inArray(tags.folderId, ids)).run();
  },
});

export type TagClosureNode = GenericClosureTableNode<TagFolderSelect>;
export type TagClosureNodeWithPath = GenericClosureTableNodeWithPath<TagFolderSelect>;
