import type { OPCUAServer } from "node-opcua";
import { logger } from "../pino/logger";
import {
  Tag,
  type FailedTag,
  type StatusCodeName,
  type TagError,
  type TagOptionsInput,
} from "./tag";
import { OpcuaFolder } from "./opcuaFolder";
import { db } from "../sqlite/db";
import { tables } from "../sqlite/tables";
import { eq } from "drizzle-orm";
import type { FolderManager } from "./folderManager";
import { err, ok, Result } from "neverthrow";
import { tryCatch } from "$lib/util/tryCatch";

export class TagManager {
  opcuaServer?: OPCUAServer;
  private tags: Map<string, Result<Tag<any>, FailedTag>> = new Map();
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

  getTagByPath(path: string) {
    const id = this.pathToId.get(path);
    if (!id) {
      return err({
        reason: "TAG_NOT_FOUND",
        cause: `no tag at path ${path}`,
      } as const);
    }
    return ok(this.tags.get(id));
  }

  getTagById(id: string) {
    const tag = this.tags.get(id);
    if (!tag) {
      return err({
        reason: "TAG_NOT_FOUND",
        cause: `no tag at id ${id}`,
      } as const);
    }
    return ok(tag);
  }

  getAllTags() {
    return Array.from(this.tags.values());
  }

  idToPath(findId: string) {
    return this.pathToId.entries().find(([id, path]) => id == findId)?.[0];
  }
  /*
  getClientTagByIdOrPath(lookup: string): ClientTag {
    const tag = this.getTagById(lookup) ?? this.getTagByPath(lookup);

    if (!tag) {
      return {
        ok: false,
        error: {
          error: {
            reason: "NOT_FOUND",
          },
        },
        value: undefined,
      };
    }

    if (tag instanceof Tag) {
      return {
        ok: true,
        value: {
          id: tag.id,
          name: tag.name,
          value: tag.value,
          statusString: tag.statusCode.name as StatusCodeName,
          options: tag.options,
        },
        error: undefined,
      };
    }

    return {
      ok: false,
      error: {
        error: tag.error,
        options: tag.options,
      },
      value: undefined,
    };
  }
*/
  // -------------------------
  // Update Functions
  // -------------------------

  createTag(opts: TagOptionsInput, writeToDb: boolean = true) {
    if (!this.opcuaServer) {
      throw new Error(
        `[TagManager] createTag() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    if (!this.folderManager) {
      throw new Error(
        `[TagManager] createTag() folderManager not initalised, please call initOpcuaServer() first`,
      );
    }

    if (this.tags.has(opts.id)) {
      return err({ reason: "TAG_ALREADY_EXISTS" } as const);
    }

    const newFolderId = opts.folderId ?? crypto.randomUUID();
    let opcuaFolder = this.folderManager.get(opts.folderId);

    if (!opcuaFolder) {
      return err({ reason: "FOLDER_NOT_FOUND" } as const);
    }

    const duplicate = this.checkDuplicate(opts, opcuaFolder);
    if (duplicate.isErr()) return err(duplicate.error);

    if (writeToDb) {
      const dbWrite = tryCatch(() => {
        db.insert(tables.tags).values(opts).run();
      });

      if (dbWrite.error) {
        return err({ reason: "DB_ERROR", cause: dbWrite.error } as const);
      }
    }

    if (opcuaFolder.node.id) {
      // reference new folder if we had to create a placeholder
      opts.folderId = newFolderId;
    }

    const tag = Tag.create(this.opcuaServer, opcuaFolder, opts);

    this.tags.set(opts.id, tag);

    const path = this.buildPath(opts);
    this.pathToId.set(path, opts.id);

    logger.info(
      `[TagManager] added tag ${opts.id}  ${opts.name}  into folder ${path}`,
    );

    if (tag.isErr()) return err(tag.error);
    return ok(tag.value);
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

    const opcuaFolder = this.folderManager.get(tagUpdates.folderId);
    if (!opcuaFolder) return err({ reason: "OPCUA_FOLDER_NOT_FOUND" } as const);

    // const duplicate = this.checkDuplicate(tagUpdates, opcuaFolder);
    // if (duplicate.isErr()) return err(duplicate.error);

    const oldTag = this.tags.get(id);
    const oldPath = this.idToPath(id);

    if (oldTag) {
      if (oldTag instanceof Tag) oldTag.dispose();
      this.tags.delete(id);
      if (oldPath) this.pathToId.delete(oldPath);
    }

    const updatedTag = Tag.create(this.opcuaServer, opcuaFolder, tagUpdates);

    this.tags.set(id, updatedTag);
    this.pathToId.set(tagUpdates.name, id);

    if (updatedTag.isErr()) return err(updatedTag.error);
    return ok(updatedTag);
  }

  // -------------------------
  // Delete Functions
  // -------------------------

  deleteTag(id: string) {
    logger.trace(`[TagManager] deleteTag() ${id}`);

    const tag = this.tags.get(id);

    if (!tag || !(tag instanceof Tag))
      return err({ reason: "TAG_NOT_FOUND" } as const);

    const dbResult = tryCatch(() =>
      db.delete(tables.tags).where(eq(tables.tags.id, id)).run(),
    );
    if (dbResult.error) {
      return err({ reason: "DB_ERROR", cause: dbResult.error } as const);
    }

    tag.dispose();
    this.tags.delete(id);
    const oldPath = this.idToPath(id);
    if (oldPath) this.pathToId.delete(oldPath);

    return ok(true);
  }

  // check if a tag has a duplicate name in
  checkDuplicate(tag: TagOptionsInput, folder: OpcuaFolder) {
    for (const t of this.tags.values()) {
      if (!(t instanceof Tag)) continue;
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

      const newTag = Tag.create(this.opcuaServer, opcuaFolder, tagOpt);

      this.tags.set(tagOpt.id, newTag);
      this.pathToId.set(tagOpt.name, tagOpt.id);
    }

    logger.info(`[TagManager] loaded ${tagOptions.length} tags from database`);
  }
}
