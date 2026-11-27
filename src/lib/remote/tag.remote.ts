import { getRequestEvent, prerender, query } from "$app/server";
import { StatusCodes } from "node-opcua";
import { getAllDataTypeStrings } from "$lib/server/tag/tag";
import { tagFoldersClosureTable } from "$lib/server/sqlite/util/tagClosureTable";
import { wireErr, wireOk } from "$lib/util/neverThrow";
import { tagManager } from "../../hooks.server";
import { assertCan } from "$lib/server/auth/authorize";

/**
 * Queries the available OPC-UA data type names.
 *
 * @returns the data type strings.
 */
export const getDataTypeStrings = query(async () => {
  assertCan(getRequestEvent().locals.ability, "read", "Tag");
  return getAllDataTypeStrings();
});

/**
 * Queries the tag folder tree (id, name, parentId).
 *
 * @returns Ok with all tag folders, or Err from the closure table.
 */
// tag folder tree (id, name, parentId) so the client can group tags by folder
export const getAllTagFolders = query(async () => {
  assertCan(getRequestEvent().locals.ability, "read", "Tag");
  const folders = tagFoldersClosureTable.getAll();
  if (folders.isErr()) return wireErr(folders.error);
  return wireOk(folders.value);
});

/**
 * Queries every tag with its client value or failure.
 *
 * @returns an array of Ok client tag values or Err failures.
 */
export const getAllTags = query(async () => {
  assertCan(getRequestEvent().locals.ability, "read", "TagValue");
  const tags = tagManager.getAllTags();
  return tags.map((tag) => {
    if (tag.isErr()) {
      return wireErr(tag.error);
    } else {
      return wireOk(tag.value.getClientValueTag());
    }
  });
});

/**
 * Prerenders the OPC-UA status code table (numeric code to name).
 *
 * @returns a map from status code number to status name.
 */
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
