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
    return this.pathToId.entries().find(([id, path]) => id == findId)?.[0];
  }

  // -------------------------
  // Update Functions
  // -------------------------

  async createTag(
    opts: TagOptionsInput,
    writeToDb: boolean = true,
  ): Promise<Tag<any>> {
    if (!this.opcuaServer || !this.folderManager) {
      throw Error(
        `[TagManager] createTag() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    const newFolderId = opts.folderId ?? crypto.randomUUID();
    const opcuaFolder =
      this.folderManager.get(opts.folderId) ??
      this.folderManager.createFolder({
        id: newFolderId,
        name: "__PLACEHOLDER__",
        parentId: null,
      });

    // reference new folder if we had to create a placeholder
    opts.folderId = newFolderId;

    const tag = new Tag(this.opcuaServer, opcuaFolder, opts);
    const path = opts.name;

    if (writeToDb) {
      if (this.tags.has(tag.id)) {
        tag.dispose();
        throw new Error(
          `[TagManager] createTag() Tag already exists at ${tag.id}`,
        );
      }

      try {
        db.insert(tables.tags)
          .values(tag.options as any)
          .run();
      } catch (e) {
        tag.dispose();
        throw e;
      }
    }

    this.tags.set(tag.id, tag);
    this.pathToId.set(path, tag.id);

    logger.info(
      `[TagManager] added tag ${tag.id}  ${tag.name}  into folder ${opcuaFolder.node.name}`,
    );

    return tag;
  }

  async updateTag(id: string, tagUpdates: TagOptionsInput) {
    if (!this.opcuaServer) {
      throw new Error(
        `[TagManager] updateTag() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    if (!this.folderManager) {
      throw new Error(
        `[TagManager] updateTag() folderManager not initalised, please call initOpcuaServer() first`,
      );
    }

    const oldTag = this.tags.get(id);
    const oldOptions = oldTag?.options;
    const oldPath = this.idToPath(id);

    if (oldTag) {
      oldTag.dispose();
      this.tags.delete(id);
      if (oldPath) this.pathToId.delete(oldPath);
    }

    const opcuaFolder = this.folderManager!.get(tagUpdates.folderId)!;
    const updatedTag = new Tag(this.opcuaServer, opcuaFolder, tagUpdates);
    this.tags.set(updatedTag.id, updatedTag);
    this.pathToId.set(tagUpdates.name, updatedTag.id);

    try {
      db.update(tables.tags).set(tagUpdates).where(eq(tables.tags.id, id)).run();
    } catch (e) {
      updatedTag.dispose();
      this.tags.delete(id);
      this.pathToId.delete(tagUpdates.name);

      if (oldOptions) {
        const restoredFolder = this.folderManager!.get(oldOptions.folderId)!;
        const restoredTag = new Tag(
          this.opcuaServer,
          restoredFolder,
          oldOptions,
        );
        this.tags.set(restoredTag.id, restoredTag);
        this.pathToId.set(oldOptions.name, restoredTag.id);
      }
      throw e;
    }

    return updatedTag;
  }

  // -------------------------
  // Delete Functions
  // -------------------------

  async deleteTag(id: string) {
    logger.trace(`[TagManager] deleteTag() ${id}`);

    const tag = this.tags.get(id);
    const oldPath = this.idToPath(id);

    if (tag) {
      tag.dispose();
      this.tags.delete(id);
      if (oldPath) this.pathToId.delete(oldPath);
    }

    const result = db.delete(tables.tags).where(eq(tables.tags.id, id)).run();
    return result.changes > 0;
  }

  // -------------------------
  // Bulk Loader
  // -------------------------

  async loadAllFromDb() {
    if (!this.opcuaServer) {
      throw new Error(
        `[TagManager] loadAllFromDb() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    if (!this.folderManager) {
      throw new Error(
        `[TagManager] loadAllFromDb() folderManager not initalised, please call initOpcuaServer() first`,
      );
    }
    const tagOptions = db.select().from(tables.tags).all();
    for (const tagOpt of tagOptions) {
      if (this.tags.has(tagOpt.id)) continue;

      const opcuaFolder = this.folderManager.get(tagOpt.folderId);
      const newTag = new Tag(this.opcuaServer, opcuaFolder, tagOpt);
      this.tags.set(newTag.id, newTag);
      this.pathToId.set(tagOpt.name, newTag.id);
    }

    logger.info(`[TagManager] loaded ${tagOptions.length} tags from database`);
  }
}
