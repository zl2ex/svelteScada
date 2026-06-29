import z from "zod";

export const z_shared_insertTagFolder = z.object({
  id: z.string().optional(),
  name: z.string(),
  tags: z.array(z.object()).optional(),
  children: z.array(z.object()).optional(),
});

export const z_shared_insertTagFolderPaths = z.object({
  ancestor: z.string(),
  descendant: z.string(),
  depth: z.number(),
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
  updatedAt: z.date().nullable().optional(),
});
