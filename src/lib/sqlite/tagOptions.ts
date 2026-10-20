import { z_TagInsert, z_TagTrendOptionsInsert } from "./tables";

/**
 * A tag row together with its trend options. The trend options are a separate
 * table keyed by `tagId`, so the composite shape is the unit the tag manager
 * and the editor work with.
 */
export const z_TagOptionsInsert = z_TagInsert.extend({
  trend: z_TagTrendOptionsInsert,
});
