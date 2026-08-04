import type { OPCUAServer } from "node-opcua";
import { logger } from "../pino/logger";
import { Tag, type TagOptionsInput } from "./tag";
import { OpcuaFolder } from "./opcuaFolder";
import { db } from "../sqlite/db";
import { tables } from "../sqlite/tables";
import { eq } from "drizzle-orm";
import type { FolderManager } from "./folderManager";
import { err, ok } from "neverthrow";
import { tryCatch } from "$lib/util/tryCatch";

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

  private buildPath(tagOptions: TagOptionsInput) {
    if (!this.folderManager) {
      throw Error(
        `[TagManager] buildPath() folderManager not initalised, please call initOpcuaServer() first`,
      );
    }
    let path = tagOptions.name;
    let folder = this.folderManager.get(tagOptions.folderId);
    while (folder?.node.parentId) {
      path = folder.node.name + "/" + path;
      folder = this.folderManager.get(folder.node.parentId);
    }
    return "/" + path;
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

  createTag(opts: TagOptionsInput, writeToDb: boolean = true) {
    if (!this.opcuaServer || !this.folderManager) {
      throw Error(
        `[TagManager] createTag() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    if (this.tags.has(opts.id))
      return err({ reason: "TAG_ALREADY_EXISTS" } as const);

    const newFolderId = opts.folderId ?? crypto.randomUUID();
    let opcuaFolder = this.folderManager.get(opts.folderId);
    if (!opcuaFolder) {
      const placeholder = this.folderManager.createFolder({
        id: newFolderId,
        name: "__PLACEHOLDER__",
        parentId: null,
      });

      if (placeholder.isErr()) return err(placeholder.error);
      opcuaFolder = placeholder.value;
    }

    const duplicate = this.checkDuplicate(opts, opcuaFolder);
    if (duplicate.isErr()) return err(duplicate.error);

    if (opcuaFolder.node.id)
      // reference new folder if we had to create a placeholder
      opts.folderId = newFolderId;

    const tag = new Tag(this.opcuaServer, opcuaFolder, opts);

    if (writeToDb) {
      const dbWrite = tryCatch(() => {
        db.insert(tables.tags).values(tag.options).run();
      });

      if (dbWrite.error)
        return err({ reason: "DB_ERROR", cause: dbWrite.error } as const);
    }

    this.tags.set(tag.id, tag);

    const path = this.buildPath(opts);
    this.pathToId.set(path, tag.id);

    logger.info(
      `[TagManager] added tag ${tag.id}  ${tag.name}  into folder ${path}`,
    );

    return ok(tag);
  }

  updateTag(id: string, tagUpdates: TagOptionsInput) {
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

    const opcuaFolder = this.folderManager.get(tagUpdates.folderId);
    if (!opcuaFolder) return err({ reason: "OPCUA_FOLDER_NOT_FOUND" } as const);
    const updatedTag = new Tag(this.opcuaServer, opcuaFolder, tagUpdates);
    this.tags.set(updatedTag.id, updatedTag);
    this.pathToId.set(tagUpdates.name, updatedTag.id);

    const dbResult = tryCatch(() =>
      db
        .update(tables.tags)
        .set(tagUpdates)
        .where(eq(tables.tags.id, id))
        .run(),
    );
    if (dbResult.error) {
      return err({ reason: "DB_ERROR", cause: dbResult.error } as const);
    }

    updatedTag.dispose();
    this.tags.delete(id);
    this.pathToId.delete(tagUpdates.name);

    if (oldOptions) {
      const restoredFolder = this.folderManager.get(oldOptions.folderId)!;
      const restoredTag = new Tag(this.opcuaServer, restoredFolder, oldOptions);
      this.tags.set(restoredTag.id, restoredTag);
      this.pathToId.set(oldOptions.name, restoredTag.id);
    }

    return ok(updatedTag);
  }

  // -------------------------
  // Delete Functions
  // -------------------------

  deleteTag(id: string) {
    logger.trace(`[TagManager] deleteTag() ${id}`);

    const tag = this.tags.get(id);

    if (!tag) return err({ reason: "TAG_NOT_FOUND" } as const);

    tag.dispose();
    this.tags.delete(id);
    const oldPath = this.idToPath(id);
    if (oldPath) this.pathToId.delete(oldPath);

    const dbResult = tryCatch(() =>
      db.delete(tables.tags).where(eq(tables.tags.id, id)).run(),
    );
    if (dbResult.error) {
      return err({ reason: "DB_ERROR", cause: dbResult.error } as const);
    }
    return ok(true);
  }

  // check if a tag has a duplicate name in
  checkDuplicate(tag: TagOptionsInput, folder: OpcuaFolder) {
    for (const t of this.tags.values()) {
      if (
        t.name == tag.name &&
        t.opcuaFolder.node.parentId == folder.node.parentId
      ) {
        return err({ reason: "DUPLICATE_TAG" } as const);
      }
    }
    return ok(true);
  }

  // -------------------------
  // Bulk Loader
  // -------------------------

  loadAllFromDb() {
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
      if (!opcuaFolder) continue;

      const newTag = new Tag(this.opcuaServer, opcuaFolder, tagOpt);
      this.tags.set(newTag.id, newTag);
      this.pathToId.set(tagOpt.name, newTag.id);
    }

    logger.info(`[TagManager] loaded ${tagOptions.length} tags from database`);
  }
}
