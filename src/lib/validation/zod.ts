import z, { string } from "zod";

// shared schemas should match the ones in /lib/server/sqlite/tables
export const z_shared_insertTagFolder = z.object({
  id: z.string().optional(),
  name: z.string(),
});

export const z_shared_insertClosureTableNode = z_shared_insertTagFolder.extend({
  parentId: z.string(),
});

export const z_shared_insertTag = z.object({
  id: z.string().optional(),
  folderId: z.string().nullable().optional(),
  name: z.string(),
  dataType: z.string(),
  value: z.number().nullable().optional(),
  nodeId: z.string().nullable().optional(),
  writeable: z.boolean().optional(),
  exposeOverOpcua: z.boolean().optional(),
  parameters: z.any().nullable().optional(),
});
