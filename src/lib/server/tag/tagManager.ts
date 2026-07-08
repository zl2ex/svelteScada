import type { OPCUAServer, UAObject } from "node-opcua";
import { TagNode } from "../../client/tag/clientTag.svelte";
import { logger } from "../pino/logger";
import { Tag, type TagOptionsInput } from "./tag";
import { OpcuaFolder } from "./opcuaFolder";
import { db } from "../sqlite/db";
import { tables } from "../sqlite/tables";
import { tagFoldersClosureTable } from "../sqlite/tagClosureTable";
import { eq } from "drizzle-orm";

export class TagManager {
  opcuaServer?: OPCUAServer;
  rootFolder?: UAObject;
  opcuaFolders: Map<string, OpcuaFolder> = new Map();
  private tags: Map<string, Tag<any>> = new Map();
  private pathToId: Map<string, string> = new Map();

  constructor() {}

  initOpcuaServer(opcuaServer: OPCUAServer) {
    this.opcuaServer = opcuaServer;
    this.rootFolder = this.opcuaServer.engine.addressSpace
      ?.getOwnNamespace()
      .addObject({
        organizedBy: this.opcuaServer.engine.addressSpace?.rootFolder.objects,
        browseName: "Tags",
      });
  }

  getParentOpcuaFolder(folderId: string | null | undefined): OpcuaFolder | undefined {
    if (!folderId) return undefined;
    return this.opcuaFolders.get(folderId);
  }

  async createTag(
    opts: TagOptionsInput<any>,
    writeToDb: boolean = true,
  ): Promise<Tag<any>> {
    if (!this.opcuaServer || !this.rootFolder) {
      throw new Error(
        `[TagManager] createTag() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    const opcuaFolder = this.getParentOpcuaFolder(opts.folderId);
    const tag = new Tag(this.opcuaServer, opcuaFolder, opts);

    const path = opts.name;

    if (writeToDb) {
      if (this.tags.has(tag.id)) {
        throw new Error(
          `[TagManager] createTag() Tag already exists at ${tag.id}`,
        );
      }

      db.insert(tables.tag).values(tag.options as any).run();
    }

    this.tags.set(tag.id, tag);
    this.pathToId.set(path, tag.id);

    logger.info(`[TagManager] added tag ${tag.id}`);

    return tag;
  }

  // -------------------------
  // Read Helpers
  // -------------------------

  getTagByPath(path: string): Tag<any> | undefined {
    const id = this.pathToId.get(path);
    if (!id) return undefined;
    return this.tags.get(id);
  }

  getNode(path: string): Tag<any> | undefined {
    return this.getTagByPath(path);
  }

  getTag(path: string): Tag<any> | undefined {
    const [parentPath, propertyName] = path.split(".", 2);
    const node = this.getTagByPath(parentPath);
    if (!(node instanceof Tag)) return undefined;
    if (propertyName && (node as any).type == "UdtTag") {
      return node.childTags.get(propertyName);
    }
    return node;
  }

  getAllTags(): Tag<any>[] {
    return Array.from(this.tags.values());
  }

  getAllChildrenAsNode(path: string): TagNode[] {
    return Array.from(this.tags.values())
      .filter((t) => false) // TD WIP parentPath removed
      .map((tag) => ({
        name: tag.name,
        id: tag.id,
        parentId: null,
        type: (tag as any).type,
      }));
  }

  // -------------------------
  // Update Functions
  // -------------------------

  async updateTag(
    id: string,
    tagUpdates: TagOptionsInput<any>,
  ): Promise<Tag<any> | null> {
    if (!this.opcuaServer || !this.rootFolder) {
      throw new Error(
        `[TagManager] updateTag() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    this.tags.delete(id);
    const oldPath = [...this.pathToId.entries()].find(([, v]) => v === id)?.[0];
    if (oldPath) this.pathToId.delete(oldPath);
    const opcuaFolder = this.getParentOpcuaFolder(tagUpdates.folderId);
    const updatedTag = new Tag(this.opcuaServer, opcuaFolder, tagUpdates);

    const dbValues = {
      name: updatedTag.options.name,
      dataType: (updatedTag.options as any).dataType,
      nodeId: (updatedTag.options as any).nodeId ?? null,
      writeable: (updatedTag.options as any).writeable ?? true,
      exposeOverOpcua: (updatedTag.options as any).exposeOverOpcua ?? true,
      parameters: (updatedTag.options as any).parameters ?? null,
    };

    if (id) {
      db.update(tables.tag).set(dbValues).where(eq(tables.tag.id, id)).run();
    } else {
      const newId = crypto.randomUUID();
      db.insert(tables.tag)
        .values({ id: newId, ...dbValues } as any)
        .run();
    }

    this.tags.set(updatedTag.id, updatedTag);
    this.pathToId.set(tagUpdates.name, updatedTag.id);

    return updatedTag;
  }

  // -------------------------
  // Move Functions
  // -------------------------

  async moveTag(
    oldPath: string,
    newParentPath: string,
    newName?: string,
  ): Promise<Tag<any> | null> {
    const id = this.pathToId.get(oldPath);
    if (!id) return null;
    const oldTag = this.tags.get(id);
    if (!(oldTag instanceof Tag)) return null;

    const name = newName ?? oldTag.name;

    this.pathToId.delete(oldPath);
    oldTag.name = name;
    this.pathToId.set(name, id);

    return oldTag;
  }

  // -------------------------
  // Delete Functions
  // -------------------------

  async deleteTag(id: string): Promise<boolean> {
    logger.trace(`[TagManager] deleteTag() ${id}`);
    if (id) {
      const result = db.delete(tables.tag).where(eq(tables.tag.id, id)).run();
      if (result.changes === 0) return false;
    }

    const oldPath = [...this.pathToId.entries()].find(([, v]) => v === id)?.[0];
    if (oldPath) this.pathToId.delete(oldPath);

    const tag = this.tags.get(id);
    if (tag) {
      tag.dispose();
      this.tags.delete(id);
    }
    return true;
  }

  // -------------------------
  // Bulk Loader
  // -------------------------

  async loadAllFromDb() {
    // Load folders and create OpcuaFolder instances
    const folders = tagFoldersClosureTable.getAll();
    for (const folder of folders) {
      const parent = folder.parentId
        ? this.opcuaFolders.get(folder.parentId)?.uaObject
        : this.rootFolder;
      if (!parent) continue;
      const opcuaFolder = new OpcuaFolder(
        this.opcuaServer!.engine.addressSpace!,
        parent,
        folder,
      );
      this.opcuaFolders.set(folder.id, opcuaFolder);
    }
    logger.info(`[TagManager] loaded ${folders.length} folders to OPC UA`);

    // Load tags
    const rows = db.select().from(tables.tag).all();
    for (const row of rows) {
      if (this.tags.has(row.id)) continue;

      const opcuaFolder = this.getParentOpcuaFolder(row.folderId);
      const tag = new Tag(this.opcuaServer!, opcuaFolder, row as any);
      this.tags.set(tag.id, tag);
      this.pathToId.set(row.name, tag.id);
    }

    logger.info(`[TagManager] loaded ${rows.length} tags from database`);
  }
}
