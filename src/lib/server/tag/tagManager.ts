import type { OPCUAServer } from "node-opcua";
import { logger } from "../pino/logger";
import { Tag, type TagOptionsInput } from "./tag";
import { OpcuaFolder } from "./opcuaFolder";
import { db } from "../sqlite/db";
import { tables } from "../sqlite/tables";
import { eq } from "drizzle-orm";
import type { FolderManager } from "./folderManager";

export class TagManager {
  opcuaServer?: OPCUAServer;
  private tags: Map<string, Tag<any>> = new Map();
  private pathToId: Map<string, string> = new Map();
  private folderManager: FolderManager | undefined;

  constructor() {}

  initOpcuaServer(opcuaServer: OPCUAServer, folderManager: FolderManager) {
    this.opcuaServer = opcuaServer;
    this.folderManager = folderManager;
  }

  async createTag(
    opts: TagOptionsInput,
    writeToDb: boolean = true,
  ): Promise<Tag<any>> {
    if (!this.opcuaServer || !this.folderManager) {
      throw Error(
        `[TagManager] createTag() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    //this.folderManager.ensureFolderExists(opts.folderId);
    const opcuaFolder =
      this.folderManager.get(opts.folderId) ??
      this.folderManager.createFolder({
        id: "stub",
        name: "stub",
        parentId: null,
      });

    const tag = new Tag(this.opcuaServer, opcuaFolder, opts);

    const path = opts.name;

    if (writeToDb) {
      if (this.tags.has(tag.id)) {
        throw new Error(
          `[TagManager] createTag() Tag already exists at ${tag.id}`,
        );
      }

      db.insert(tables.tags)
        .values(tag.options as any)
        .run();
    }

    this.tags.set(tag.id, tag);
    this.pathToId.set(path, tag.id);

    logger.info(
      `[TagManager] added tag ${tag.id}  ${tag.name}  into folder ${opcuaFolder.node.name}`,
    );

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

  getTagById(id: string): Tag<any> | undefined {
    return this.tags.get(id);
  }

  getAllTags(): Tag<any>[] {
    return Array.from(this.tags.values());
  }

  idToPath(findId: string) {
    return this.pathToId.entries().find(([id, path]) => id == findId)?.[1];
  }

  // -------------------------
  // Update Functions
  // -------------------------

  async updateTag(
    id: string,
    tagUpdates: TagOptionsInput,
  ): Promise<Tag<any> | null> {
    if (!this.opcuaServer) {
      throw new Error(
        `[TagManager] updateTag() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    this.tags.delete(id);
    const oldPath = [...this.pathToId.entries()].find(([, v]) => v === id)?.[0];
    if (oldPath) this.pathToId.delete(oldPath);
    const opcuaFolder = this.folderManager?.getOpcuaFolder(tagUpdates.folderId);
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
      db.update(tables.tags).set(dbValues).where(eq(tables.tags.id, id)).run();
    } else {
      const newId = crypto.randomUUID();
      db.insert(tables.tags)
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
      const result = db.delete(tables.tags).where(eq(tables.tags.id, id)).run();
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
    const tagOptions = db.select().from(tables.tags).all();
    for (const tagOpt of tagOptions) {
      if (this.tags.has(tagOpt.id)) continue;

      const opcuaFolder = this.folderManager.get(tagOpt.folderId);
      const newTag = new Tag(this.opcuaServer!, opcuaFolder, tagOpt);
      this.tags.set(newTag.id, newTag);
      this.pathToId.set(tagOpt.name, newTag.id);
    }

    logger.info(`[TagManager] loaded ${tagOptions.length} tags from database`);
  }
}
