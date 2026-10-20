import type { OPCUAServer } from "node-opcua";
import { logger } from "../pino/logger";
import { resolveDevicePath, Tag, type FailedTag, type TagOptionsInput } from "./tag";
import { OpcuaFolder } from "./opcuaFolder";
import { db } from "../sqlite/db";
import { tables } from "$lib/sqlite/tables";
import { eq } from "drizzle-orm";
import type { FolderManager } from "./folderManager";
import { err, ok, Result } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { newId } from "$lib/util/newId";
import { errorToString, neverThrowErrorToString, type NeverThrowError } from "$lib/util/neverThrow";
import { publishTagValue } from "../../../live/tags";
import { tagFoldersClosureTable } from "../sqlite/util/tagClosureTable";

export class TagManager {
  opcuaServer?: OPCUAServer;
  #tags: Map<string, Result<Tag, FailedTag>> = new Map();
  #folderManager: FolderManager | undefined;

  constructor() {}

  initOpcuaServer(opcuaServer: OPCUAServer, folderManager: FolderManager) {
    this.opcuaServer = opcuaServer;
    this.#folderManager = folderManager;
  }

  #buildPath(tagOptions: TagOptionsInput) {
    const folderId = tagOptions.folderId;
    if (!folderId) return "/" + tagOptions.name;

    const folder = tagFoldersClosureTable.get(folderId);
    if (folder.isErr()) return "/" + tagOptions.name;

    return folder.value.path + "/" + tagOptions.name;
  }

  // the full path of a tag, whether it built or not
  #pathOf(tag: Result<Tag, FailedTag>): string | undefined {
    if (tag.isOk()) return tag.value.path;
    return tag.error.options ? this.#buildPath(tag.error.options) : undefined;
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
    for (const tag of this.#tags.values()) {
      if (this.#pathOf(tag) === path) return ok(tag);
    }
    return err({
      reason: "TAG_NOT_FOUND",
      cause: `no tag at path ${path}`,
    } as const satisfies NeverThrowError);
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
    const tag = this.#tags.get(findId);
    return tag ? this.#pathOf(tag) : undefined;
  }

  /**
   * Recompute every built tag's path. Folder renames and moves change the
   * closure table, so the client-facing paths have to be rebuilt to match.
   */
  rebuildPaths() {
    for (const tag of this.#tags.values()) {
      if (tag.isOk()) tag.value.path = this.#buildPath(tag.value.options);
    }
  }

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
        cause: `opcua Folder not found at ${opts.folderId}`,
      } as const satisfies NeverThrowError);
    }

    const duplicate = this.checkDuplicate(opts, opcuaFolder);
    if (duplicate.isErr()) return err(duplicate.error);

    if (writeToDb) {
      const dbWrite = attempt(() => db.insert(tables.tags).values(opts).run());

      if (dbWrite.error) {
        return err({
          reason: "DB_ERROR",
          cause: errorToString(dbWrite.error),
        } as const satisfies NeverThrowError);
      }

      opts.trend.tagId = opts.id; // make sure the id's match
      const dbTrend = attempt(() => db.insert(tables.tag_trend_options).values(opts.trend).run());

      if (dbTrend.error) {
        return err({
          reason: "DB_ERROR",
          cause: errorToString(dbTrend.error),
        } as const satisfies NeverThrowError);
      }
    }

    if (opcuaFolder.node.id) {
      // reference new folder if we had to create a placeholder
      opts.folderId = newFolderId;
    }

    const tag = this.tagConfigError(Tag.create(this.opcuaServer, opcuaFolder, opts));

    if (tag.isOk()) tag.value.path = this.#buildPath(opts);

    this.#trackValue(tag);

    this.#tags.set(opts.id, tag);

    logger.info(
      `[TagManager] added tag ${opts.id}  ${opts.name}  into folder ${this.#buildPath(opts)}`,
    );

    if (tag.isErr()) {
      return err(tag.error);
    }

    return ok(tag);
  }

  updateTag(id: string, tagUpdates: TagOptionsInput) {
    const dbResult = attempt(() =>
      db.update(tables.tags).set(tagUpdates).where(eq(tables.tags.id, id)).run(),
    );

    if (dbResult.error) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(dbResult.error),
      } as const satisfies NeverThrowError);
    }

    const dbTrend = attempt(() =>
      db
        .update(tables.tag_trend_options)
        .set(tagUpdates.trend)
        .where(eq(tables.tag_trend_options.tagId, id))
        .run(),
    );

    if (dbTrend.error) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(dbTrend.error),
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

    const rebuiltTag = this.tagConfigError(Tag.create(this.opcuaServer, opcuaFolder, options));

    if (rebuiltTag.isOk()) rebuiltTag.value.path = this.#buildPath(options);

    this.#trackValue(rebuiltTag);

    this.#tags.set(id, rebuiltTag);

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

  async loadAllFromDb() {
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

    const tagOptions = await attempt(() =>
      db.query.tags.findMany({
        with: {
          trend: true,
        },
      }),
    );
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

      if (!tagOpt.trend) continue;

      const tag = this.tagConfigError(Tag.create(this.opcuaServer, opcuaFolder, tagOpt));

      if (tag.isOk()) tag.value.path = this.#buildPath(tagOpt);

      this.#trackValue(tag);

      this.#tags.set(tagOpt.id, tag);
    }

    logger.info(`[TagManager] loaded ${tagOptions.data.length} tags from database`);
    return ok(true);
  }
}
