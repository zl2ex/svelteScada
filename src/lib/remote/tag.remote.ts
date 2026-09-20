import { query } from "$app/server";
import { getAllDataTypeStrings } from "$lib/server/tag/tag";

export const getDataTypeStrings = query(async () => {
  return getAllDataTypeStrings();
});
