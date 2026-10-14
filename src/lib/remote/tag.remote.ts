import { prerender, query } from "$app/server";
import { StatusCodes } from "node-opcua";
import { getAllDataTypeStrings } from "$lib/server/tag/tag";
import { tagFoldersClosureTable } from "$lib/server/sqlite/util/tagClosureTable";
import { wireErr, wireOk } from "$lib/util/neverThrow";
import { tagManager } from "../../hooks.server";

export const getDataTypeStrings = query(async () => {
  return getAllDataTypeStrings();
});

// tag folder tree (id, name, parentId) so the client can group tags by folder
export const getAllTagFolders = query(async () => {
  const folders = tagFoldersClosureTable.getAll();
  if (folders.isErr()) return wireErr(folders.error);
  return wireOk(folders.value);
});

export const getAllTags = query(async () => {
  const tags = tagManager.getAllTags();
  return tags.map((tag) => {
    if (tag.isErr()) {
      return wireErr(tag.error);
    } else {
      return wireOk(tag.value.getClientValueTag());
    }
  });
});

// static OPC-UA status code table (base code -> name), prerendered at build
// time so the client can resolve a trend point's numeric statusCode to a name
export const getOpcuaStatusCodeMap = prerender(() => {
  const map: Record<number, string> = {};
  for (const [name, code] of Object.entries(StatusCodes)) {
    const value = (code as { value?: unknown } | undefined)?.value;
    if (typeof value === "number") map[value] = name;
  }
  return map;
});
