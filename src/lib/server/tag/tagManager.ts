import type { OPCUAServer } from "node-opcua";
import { logger } from "../pino/logger";
import { resolveDevicePath, Tag, type FailedTag, type TagOptionsInput } from "./tag";
import { OpcuaFolder } from "./opcuaFolder";
import { db } from "../sqlite/db";
import { tables } from "../sqlite/tables";
import { eq } from "drizzle-orm";
import type { FolderManager } from "./folderManager";
import { err, ok, Result } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { newId } from "$lib/util/newId";
import { errorToString, neverThrowErrorToString, type NeverThrowError } from "$lib/util/neverThrow";
import { publishTagValue } from "../../../live/tags";

export class TagManager {
  opcuaServer?: OPCUAServer;
  #tags: Map<string, Result<Tag, FailedTag>> = new Map();
  #pathToId: Map<string, string> = new Map();
  #folderManager: FolderManager | undefined;

  constructor() {}

  initOpcuaServer(opcuaServer: OPCUAServer, folderManager: FolderManager) {
    this.opcuaServer = opcuaServer;
    this.#folderManager = folderManager;
  }

  #buildPath(tagOptions: TagOptionsInput) {
    if (!this.#folderManager) {
      throw Error(
        `[TagManager] buildPath() folderManager not initalised, please call initOpcuaServer() first`,
      );
    }
    let path = tagOptions.name;
    let folder = this.#folderManager.get(tagOptions.folderId);
    while (folder?.node.parentId) {
      path = folder.node.name + "/" + path;
      folder = this.#folderManager.get(folder.node.parentId);
    }
    return "/" + path;
  }

  /**
   * Mirror tag value changes to the front end. Tag calls onChange on every
   * value or status change, we fan it out to the $live stream.
   */
  #trackValue(tag: Result<Tag, FailedTag>) {
    if (tag.isErr()) {
      publishTagValue(err(tag.error));
      return;
    }
    const created = tag.value;
    created.onChange = (value, source, statusCode) => {
      publishTagValue(ok(created.getClientValueTag()));
    };
  }

  // -------------------------
  // Read Helpers
  // -------------------------

  getTagByPath(path: string) {
    const id = this.#pathToId.get(path);
    if (!id) {
      return err({
        reason: "TAG_NOT_FOUND",
        cause: `no tag at path ${path}`,
      } as const satisfies NeverThrowError);
    }
    return ok(this.#tags.get(id));
  }

  getTagById(id: string) {
    const tag = this.#tags.get(id);
    if (!tag) {
      return err({
        reason: "TAG_NOT_FOUND",
        cause: `no tag at id ${id}`,
      } as const satisfies NeverThrowError);
    }
    return ok(tag);
  }

  getAllTags() {
    return Array.from(this.#tags.values());
  }

  idToPath(findId: string) {
    return this.#pathToId.entries().find(([id, path]) => id == findId)?.[0];
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
      throw Error(
        `[TagManager] createTag() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    if (!this.#folderManager) {
      throw Error(
        `[TagManager] createTag() folderManager not initalised, please call initOpcuaServer() first`,
      );
    }

    if (this.#tags.has(opts.id)) {
      return err({
        reason: "TAG_ALREADY_EXISTS",
        cause: `Tag Already exists at ${opts.id} ${opts.name}`,
      } as const satisfies NeverThrowError);
    }

    const newFolderId = opts.folderId ?? newId();
    let opcuaFolder = this.#folderManager.get(opts.folderId);

    if (!opcuaFolder) {
      return err({
        reason: "FOLDER_NOT_FOUND",
        cause: `opcua Folder not foind at ${opts.folderId}`,
      } as const satisfies NeverThrowError);
    }

    const duplicate = this.checkDuplicate(opts, opcuaFolder);
    if (duplicate.isErr()) return err(duplicate.error);

    if (writeToDb) {
      const dbWrite = attempt(() => {
        db.insert(tables.tags).values(opts).run();
      });

      if (dbWrite.error) {
        return err({
          reason: "DB_ERROR",
          cause: errorToString(dbWrite.error),
        } as const satisfies NeverThrowError);
      }
    }

    if (opcuaFolder.node.id) {
      // reference new folder if we had to create a placeholder
      opts.folderId = newFolderId;
    }

    const tag = this.tagConfigError(Tag.create(this.opcuaServer, opcuaFolder, opts));

    this.#trackValue(tag);

    this.#tags.set(opts.id, tag);

    const path = this.#buildPath(opts);
    this.#pathToId.set(path, opts.id);

    logger.info(`[TagManager] added tag ${opts.id}  ${opts.name}  into folder ${path}`);

    if (tag.isErr()) {
      return err(tag.error);
    }

    return ok(tag);
  }

  updateTag(id: string, tagUpdates: TagOptionsInput) {
    const dbResult = attempt(() => db.update(tables.tags).set(tagUpdates).where(eq(tables.tags.id, id)).run());

    if (dbResult.error) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(dbResult.error),
      } as const satisfies NeverThrowError);
    }

    return this.#replaceTag(id, tagUpdates);
  }

  // -------------------------
  // Reload Functions
  // -------------------------

  /**
   * Build every tag that points at `deviceName` through its `nodeId` again,
   * returning the ids that were rebuilt.
   *
   * A tag subscribes to its driver while it is built, so a tag that was built
   * while the device could not build its driver has nothing subscribed and stays
   * broken until the device can and the tag is built again. A tag that still
   * cannot be built is left in the map as the error it is now, so the client can
   * keep showing it.
   */
  reloadTagsForDevice(deviceName: string) {
    logger.trace(`[TagManager] reloadTagsForDevice() reloading tags on ${deviceName}`);

    const reloaded: string[] = [];

    // getAllTags() is a snapshot, so swapping tags out under the loop is safe
    for (const tag of this.getAllTags()) {
      const options = tag.isOk() ? tag.value.options : tag.error.options;
      const nodeId = options.nodeId;
      if (!nodeId) continue;
      if (resolveDevicePath(nodeId).deviceName !== deviceName) continue;

      const rebuilt = this.#replaceTag(options.id, { ...options });
      if (rebuilt.isErr()) {
        logger.error(
          `[TagManager] reloadTagsForDevice() ${options.id} ${options.name} could not be rebuilt on ${deviceName}: ${neverThrowErrorToString(rebuilt.error)}`,
        );
        continue;
      }
      reloaded.push(options.id);
    }

    return reloaded;
  }

  /**
   * Swap the tag at `id` for one freshly built from `options`, leaving the
   * rebuilt tag (or the error that stopped it) in the map.
   *
   * Editing and reloading both land here: the driver subscription is made while
   * the tag is built, so a tag only has one by being built again.
   */
  #replaceTag(id: string, options: TagOptionsInput) {
    if (!this.opcuaServer) {
      throw Error(
        `[TagManager] replaceTag() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    if (!this.#folderManager) {
      throw Error(
        `[TagManager] replaceTag() folderManager not initalised, please call initOpcuaServer() first`,
      );
    }

    // resolved before the old tag is touched so a tag whose folder has gone
    // missing is left where it is rather than dropped out of the map
    const opcuaFolder = this.#folderManager.get(options.folderId);
    if (!opcuaFolder) {
      return err({
        reason: "OPCUA_FOLDER_NOT_FOUND",
        cause: `no opcua folder at ${options.folderId}`,
      } as const satisfies NeverThrowError);
    }

    // const duplicate = this.checkDuplicate(options, opcuaFolder);
    // if (duplicate.isErr()) return err(duplicate.error);

    const oldTag = this.#tags.get(id);
    const oldPath = this.idToPath(id);

    if (oldTag?.isOk()) {
      // keep old tag value when rebuilding only if the datatype is the same
      if (options.dataType == oldTag.value.options.dataType) {
        options.initalValue = String(oldTag.value.value);
      }
      const disposed = oldTag.value.dispose();
      if (disposed.isErr()) {
        logger.error(disposed.error);
      }
    }
    this.#tags.delete(id);

    if (oldPath) this.#pathToId.delete(oldPath);

    const rebuiltTag = this.tagConfigError(Tag.create(this.opcuaServer, opcuaFolder, options));

    this.#trackValue(rebuiltTag);

    this.#tags.set(id, rebuiltTag);

    const path = this.#buildPath(options);
    this.#pathToId.set(path, id);

    if (rebuiltTag.isErr()) {
      return err(rebuiltTag.error);
    }

    return ok(rebuiltTag);
  }

  // -------------------------
  // Delete Functions
  // -------------------------

  deleteTag(id: string) {
    logger.trace(`[TagManager] deleteTag() ${id}`);

    const tag = this.#tags.get(id);

    if (!tag)
      return err({
        reason: "TAG_NOT_FOUND",
        cause: `Tag not found at ${id}`,
      } as const satisfies NeverThrowError);

    const dbResult = attempt(() => db.delete(tables.tags).where(eq(tables.tags.id, id)).run());
    if (dbResult.error) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(dbResult.error),
      } as const satisfies NeverThrowError);
    }

    if (tag.isOk()) {
      const disposed = tag.value.dispose();
      if (disposed.isErr()) {
        logger.error(disposed.error);
      }
    }

    this.#tags.delete(id);
    const oldPath = this.idToPath(id);
    if (oldPath) this.#pathToId.delete(oldPath);

    return ok(true);
  }

  // check if a tag has a duplicate name in
  checkDuplicate(tag: TagOptionsInput, folder: OpcuaFolder) {
    for (const t of this.#tags.values()) {
      if (t.isErr()) continue;
      if (t.value.name == tag.name && t.value.opcuaFolder.node.parentId == folder.node.parentId) {
        return err({
          reason: "DUPLICATE_TAG",
          cause: `Duplicate tag ${tag.id}  ${tag.name}`,
        } as const satisfies NeverThrowError);
      }
    }
    return ok(true);
  }

  // wrap the Tag.create calls in this to lump all errors returned under TAG_CONFIG_ERROR
  tagConfigError(newTag: Result<Tag, FailedTag>) {
    // collect all tag errors into TAG_CONFIG_ERROR for consistency
    if (newTag.isErr()) {
      return err({
        reason: "TAG_CONFIG_ERROR",
        cause: newTag.error,
        options: newTag.error.options,
      } as const satisfies FailedTag);
    } else {
      return ok(newTag.value);
    }
  }

  // -------------------------
  // Bulk Loader
  // -------------------------

  loadAllFromDb() {
    if (!this.opcuaServer) {
      throw Error(
        `[TagManager] loadAllFromDb() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    if (!this.#folderManager) {
      throw Error(
        `[TagManager] loadAllFromDb() folderManager not initalised, please call initOpcuaServer() first`,
      );
    }

    const tagOptions = attempt(() => db.select().from(tables.tags).all());
    if (tagOptions.error) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(tagOptions.error),
      } as const satisfies NeverThrowError);
    }

    for (const tagOpt of tagOptions.data) {
      if (this.#tags.has(tagOpt.id)) continue;

      const opcuaFolder = this.#folderManager.get(tagOpt.folderId);
      if (!opcuaFolder) continue;

      const tag = this.tagConfigError(Tag.create(this.opcuaServer, opcuaFolder, tagOpt));

      this.#trackValue(tag);

      this.#tags.set(tagOpt.id, tag);

      // the same key createTag() uses, so a tag read from the database is
      // looked up and published under the same path as one made at runtime
      this.#pathToId.set(this.#buildPath(tagOpt), tagOpt.id);
    }

    logger.info(`[TagManager] loaded ${tagOptions.data.length} tags from database`);
    return ok(true);
  }
}
