import type { OPCUAServer } from "node-opcua";
import { eq, inArray } from "drizzle-orm";
import { logger } from "../pino/logger";
import { resolveDevicePath, Tag, type FailedTag, type TagOptionsInput, type TagValue } from "./tag";
import { OpcuaFolder } from "./opcuaFolder";
import { db } from "../sqlite/db";
import { tables } from "$lib/sqlite/tables";
import type { FolderManager } from "./folderManager";
import { err, ok, type Result } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { newId } from "$lib/util/newId";
import { errorToString, neverThrowErrorToString, type NeverThrowError } from "$lib/util/neverThrow";
import { publishTagValue } from "../../../live/tags";
import { tagFoldersClosureTable } from "../sqlite/util/tagClosureTable";
import { udtManager } from "../../../hooks.server";
import { normalizeTagOptions } from "./legacyNormalization";

export class TagManager {
  opcuaServer?: OPCUAServer;
  #tags: Map<string, Result<Tag, FailedTag>> = new Map();
  #folderManager: FolderManager | undefined;

  /**
   * Creates an empty tag manager.
   */
  constructor() {}

  /**
   * Stores the OPC UA server and folder manager used to build tags.
   *
   * @param opcuaServer - Running OPC UA server for exposed tag variables.
   * @param folderManager - Folder manager providing OPC UA folders for tags.
   */
  initOpcuaServer(opcuaServer: OPCUAServer, folderManager: FolderManager) {
    this.opcuaServer = opcuaServer;
    this.#folderManager = folderManager;
  }

  /**
   * Returns the options of a loaded tag, whether it was created successfully or failed.
   *
   * @param tag - Tag result to read options from.
   * @returns The tag options.
   */
  #optionsOf(tag: Result<Tag, FailedTag>): TagOptionsInput {
    return tag.isOk() ? tag.value.options : tag.error.options;
  }

  /**
   * Computes a tag's runtime path from its folder or parent tag.
   *
   * @param tagOptions - Options of the tag to path.
   * @returns The computed path string.
   */
  #buildPath(tagOptions: TagOptionsInput) {
    if (tagOptions.parentTagId) {
      const parent = this.#tags.get(tagOptions.parentTagId);
      const parentPath = parent ? this.#pathOf(parent) : undefined;
      return `${parentPath ?? ""}.${tagOptions.name}`;
    }

    const folderId = tagOptions.folderId;
    if (!folderId) return "/" + tagOptions.name;

    const folder = tagFoldersClosureTable.get(folderId);
    if (folder.isErr()) return "/" + tagOptions.name;

    return folder.value.path + "/" + tagOptions.name;
  }

  /**
   * Returns a tag's current path, falling back to computing it from its options.
   *
   * @param tag - Tag result to read a path from.
   * @returns The path, or undefined when it cannot be determined.
   */
  #pathOf(tag: Result<Tag, FailedTag>): string | undefined {
    if (tag.isOk()) return tag.value.path;
    return tag.error.options ? this.#buildPath(tag.error.options) : undefined;
  }

  /**
   * Publishes the tag's value to live clients on change, or publishes its error.
   *
   * @param tag - Tag result to track.
   */
  #trackValue(tag: Result<Tag, FailedTag>) {
    if (tag.isErr()) {
      publishTagValue(err(tag.error));
      return;
    }
    const created = tag.value;
    created.onChange = () => {
      publishTagValue(ok(created.getClientValueTag()));
    };
  }

  /**
   * Returns direct child tag entries for a parent tag id.
   *
   * @param parentId - Parent tag id to find children of.
   * @returns Array of id/tag pairs.
   */
  #childrenOf(parentId: string) {
    return [...this.#tags.entries()].flatMap(([id, tag]) => {
      if (this.#optionsOf(tag).parentTagId !== parentId) return [];
      return [{ id, tag }];
    });
  }

  /**
   * Collects the options of every descendant tag keyed by id.
   *
   * @param parentId - Parent tag id to start from.
   * @param [out] - Accumulator map, defaults to a new map.
   * @returns Map of tag id to a copy of its options.
   */
  #collectSubtreeOptions(parentId: string, out = new Map<string, TagOptionsInput>()) {
    for (const { id, tag } of this.#childrenOf(parentId)) {
      out.set(id, { ...this.#optionsOf(tag) });
      this.#collectSubtreeOptions(id, out);
    }
    return out;
  }

  /**
   * Finds a loaded tag by its runtime path.
   *
   * @param path - Runtime path to look up.
   * @returns Ok with the tag result, or Err when no tag has that path.
   */
  getTagByPath(path: string) {
    const tag = this.#tags.values().find((item) => this.#pathOf(item) === path);
    if (!tag) {
      return err({
        reason: "TAG_NOT_FOUND",
        cause: `no tag at path ${path}`,
      } as const satisfies NeverThrowError);
    }
    return ok(tag);
  }

  /**
   * Finds a loaded tag result by id.
   *
   * @param id - Tag id to look up.
   * @returns Ok with the tag result, or Err when no tag has that id.
   */
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

  /**
   * Finds a loaded tag result by id first, then by runtime path.
   *
   * @param lookup - Id or runtime path to look up.
   * @returns Ok with the tag result, or Err when neither matches.
   */
  getTagByIdOrPath(lookup: string) {
    const tag =
      this.#tags.get(lookup) ?? this.#tags.values().find((item) => this.#pathOf(item) === lookup);
    if (!tag) {
      return err({
        reason: "TAG_NOT_FOUND",
        cause: `no tag at path or id ${lookup}`,
      } as const satisfies NeverThrowError);
    }
    return ok(tag);
  }

  /**
   * Returns every loaded tag result.
   *
   * @returns Array of tag results.
   */
  getAllTags() {
    return Array.from(this.#tags.values());
  }

  /**
   * Returns only the successfully created tag instances.
   *
   * @returns Array of `Tag` instances.
   */
  getAllTagInstances() {
    return this.getAllTags().flatMap((tag) => (tag.isOk() ? [tag.value] : []));
  }

  /**
   * Returns the current runtime path of every loaded tag keyed by tag id.
   *
   * @returns Map of tag id to runtime path.
   */
  getAllTagPaths() {
    const paths = new Map<string, string>();
    for (const [id, tag] of this.#tags) {
      const path = this.#pathOf(tag);
      if (path) paths.set(id, path);
    }
    return paths;
  }

  /**
   * Applies rewritten binding data to loaded tag options and returns the updated options.
   *
   * @param updates - Map of tag id to rewritten bindings and UDT overrides.
   * @returns Array of updated tag option copies.
   */
  applyBindingUpdates(
    updates: Map<
      string,
      {
        bindings: TagOptionsInput["bindings"];
        udtOverrides: TagOptionsInput["udtOverrides"];
      }
    >,
  ) {
    const updated: TagOptionsInput[] = [];
    for (const [id, update] of updates) {
      const tag = this.#tags.get(id);
      if (!tag) continue;
      const options = this.#optionsOf(tag);
      options.bindings = update.bindings;
      options.udtOverrides = update.udtOverrides;
      updated.push({ ...options });
    }
    return updated;
  }

  /**
   * Returns the options of a tag's entire subtree, excluding the tag itself.
   *
   * @param id - Parent tag id to collect from.
   * @returns Array of descendant tag options.
   */
  getSubtreeOptions(id: string) {
    return [...this.#collectSubtreeOptions(id).values()];
  }

  /**
   * Resolves a tag id to its current runtime path.
   *
   * @param findId - Tag id to resolve.
   * @returns The path, or undefined when the tag is not loaded.
   */
  idToPath(findId: string) {
    const tag = this.#tags.get(findId);
    return tag ? this.#pathOf(tag) : undefined;
  }

  /**
   * Recomputes runtime paths for all root tags and their descendants.
   */
  rebuildPaths() {
    /**
     * Recomputes paths recursively for a tag and its children.
     *
     * @param tag - Tag result to visit.
     */
    const visit = (tag: Result<Tag, FailedTag>) => {
      if (tag.isErr()) return;
      tag.value.path = this.#buildPath(tag.value.options);
      for (const child of this.#childrenOf(tag.value.id)) visit(child.tag);
    };

    for (const tag of this.#tags.values()) {
      if (!this.#optionsOf(tag).parentTagId) visit(tag);
    }
  }

  /**
   * Counts loaded tags whose data type matches the given name.
   *
   * @param name - Data type/UDT name to count.
   * @returns Number of matching tags.
   */
  countUdtInstances(name: string) {
    return this.getAllTags().filter((tag) => this.#optionsOf(tag).dataType === name).length;
  }

  /**
   * Disposes and removes tags whose folder is in the given set, including their children.
   *
   * @param folderIds - Folder ids whose tags should be removed.
   * @returns Unique ids of the removed tags.
   */
  removeTagsInFolders(folderIds: string[]) {
    const folders = new Set(folderIds);
    const removed: string[] = [];

    for (const [id, tag] of this.#tags) {
      const options = this.#optionsOf(tag);
      if (!options.folderId || !folders.has(options.folderId)) continue;
      if (tag.isOk()) {
        const disposed = tag.value.dispose();
        if (disposed.isErr()) logger.error(disposed.error);
      }
      this.#tags.delete(id);
      removed.push(id);
    }

    for (const id of removed) {
      for (const child of [...this.#childrenOf(id)]) {
        if (this.#tags.has(child.id)) {
          if (child.tag.isOk()) child.tag.value.dispose();
          this.#tags.delete(child.id);
          removed.push(child.id);
        }
      }
    }

    return [...new Set(removed)];
  }

  /**
   * Renames the data type on loaded tags that reference the old UDT name.
   *
   * @param oldName - Previous UDT name.
   * @param newName - New UDT name.
   */
  renameUdtDataType(oldName: string, newName: string) {
    for (const tag of this.#tags.values()) {
      const options = this.#optionsOf(tag);
      if (options.dataType === oldName) options.dataType = newName;
    }
  }

  /**
   * Resolves the OPC UA folder for a row by walking up its parent tag chain.
   *
   * @param row - Tag options row to resolve.
   * @param rowMap - Map of all rows by id, used to find parents.
   * @returns The folder for the row's root ancestor, or undefined when not found.
   */
  #folderForRow(row: TagOptionsInput, rowMap: Map<string, TagOptionsInput>) {
    let current = row;
    while (current.parentTagId) {
      const parent = rowMap.get(current.parentTagId);
      if (!parent) break;
      current = parent;
    }
    return this.#folderManager?.get(current.folderId);
  }

  /**
   * Builds tag instances for rows, links parent/child relationships and publishes values.
   *
   * @param rows - Tag option rows to build.
   * @returns Map of tag id to the resulting tag result.
   * @throws {Error} when the OPC UA server or folder manager is not initialised.
   */
  #buildRuntime(rows: TagOptionsInput[]) {
    if (!this.opcuaServer) throw Error("[TagManager] opcuaServer not initialised");
    if (!this.#folderManager) throw Error("[TagManager] folderManager not initialised");

    const rowMap = new Map(rows.map((row) => [row.id, row]));
    const created = new Map<string, Result<Tag, FailedTag>>();
    for (const row of rows) {
      const folder = this.#folderForRow(row, rowMap);
      if (!folder) continue;
      const tag = this.tagConfigError(Tag.create(this.opcuaServer, folder, row));
      created.set(row.id, tag);
    }

    for (const [id, tag] of created) {
      this.#tags.set(id, tag);
    }

    for (const row of [...rows].reverse()) {
      const tag = created.get(row.id);
      if (!tag?.isOk()) continue;
      const parentId = tag.value.options.parentTagId;
      if (!parentId) continue;
      const parent = created.get(parentId) ?? this.#tags.get(parentId);
      if (parent?.isOk()) parent.value.attachRuntimeChild(tag.value);
    }

    for (const row of [...rows].reverse()) {
      const tag = created.get(row.id);
      if (tag?.isOk() && Object.keys(tag.value.children).length > 0) {
        tag.value.recomputeFromChildren();
      }
    }

    for (const createdTag of created.values()) {
      if (!createdTag.isOk()) continue;
      const parentId = createdTag.value.options.parentTagId;
      if (!parentId || created.has(parentId)) continue;
      const parent = this.#tags.get(parentId);
      if (parent?.isOk()) parent.value.recomputeFromChildren();
    }

    this.rebuildPaths();
    for (const tag of created.values()) this.#trackValue(tag);
    return created;
  }

  /**
   * Validates options, optionally persists them and creates a runtime tag.
   *
   * @param opts - Options for the new tag.
   * @param [writeToDb] - Whether to insert the tag row, defaults to true.
   * @returns Ok with the created tag result, or Err when it already exists, the folder or a
   * duplicate is missing, or persistence fails.
   */
  createTag(opts: TagOptionsInput, writeToDb: boolean = true) {
    if (!this.opcuaServer) {
      throw Error(`[TagManager] createTag() opcuaServer not initalised`);
    }
    if (!this.#folderManager) {
      throw Error(`[TagManager] createTag() folderManager not initalised`);
    }
    if (this.#tags.has(opts.id)) {
      return err({
        reason: "TAG_ALREADY_EXISTS",
        cause: `Tag Already exists at ${opts.id} ${opts.name}`,
      } as const satisfies NeverThrowError);
    }

    const folder = this.#folderManager.get(opts.folderId);
    if (!folder) {
      return err({
        reason: "FOLDER_NOT_FOUND",
        cause: `opcua Folder not found at ${opts.folderId}`,
      } as const satisfies NeverThrowError);
    }

    const duplicate = this.checkDuplicate(opts, folder);
    if (duplicate.isErr()) return err(duplicate.error);

    if (writeToDb) {
      const written = attempt(() =>
        db
          .insert(tables.tags)
          .values(opts as typeof tables.tags.$inferInsert)
          .run(),
      );
      if (written.isErr) {
        return err({
          reason: "DB_ERROR",
          cause: errorToString(written.error),
        } as const satisfies NeverThrowError);
      }
    }

    const created = this.#buildRuntime([opts]);
    const root = created.get(opts.id);
    if (!root)
      return err({
        reason: "TAG_CREATE_FAILED",
        cause: "root tag not created",
      } as const satisfies NeverThrowError);
    if (root.isErr()) return err(root.error);
    return ok(root);
  }

  /**
   * Replaces an existing tag definition, persists it and rebuilds its runtime instance.
   *
   * Preserved UDT children are re-attached to the rebuilt tag.
   *
   * @param id - Id of the tag to update.
   * @param tagUpdates - New tag options.
   * @returns Ok with the rebuilt tag result, or Err when the tag/folder is missing or writes fail.
   */
  updateTag(id: string, tagUpdates: TagOptionsInput) {
    const existing = this.#tags.get(id);
    if (!existing) {
      return err({
        reason: "TAG_NOT_FOUND",
        cause: `no tag at id ${id}`,
      } as const satisfies NeverThrowError);
    }

    const oldOptions = this.#optionsOf(existing);
    const next = { ...tagUpdates };
    const nextDefinition = udtManager.getUdt(next.dataType);
    if (nextDefinition) {
      next.udtDefinitionId = nextDefinition.id;
    } else {
      next.udtDefinitionId = null;
    }

    const preservedChildren = existing.isOk() ? Object.values(existing.value.children) : [];

    if (oldOptions.parentTagId) {
      const parent = this.#tags.get(oldOptions.parentTagId);
      if (parent?.isOk()) parent.value.detachRuntimeChild(oldOptions.name);
    }

    if (existing.isOk()) {
      existing.value.detachRuntimeChildren();
      existing.value.dispose();
    }
    this.#tags.delete(id);

    const written = attempt(() =>
      db
        .update(tables.tags)
        .set(next as typeof tables.tags.$inferInsert)
        .where(eq(tables.tags.id, id))
        .run(),
    );
    if (written.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(written.error),
      } as const satisfies NeverThrowError);
    }

    if (!this.opcuaServer || !this.#folderManager) {
      throw Error("[TagManager] updateTag() server/folder manager not initialised");
    }

    let folder = this.#folderManager.get(next.folderId);
    if (!folder && next.parentTagId) {
      const parent = this.#tags.get(next.parentTagId);
      if (parent?.isOk()) folder = parent.value.opcuaFolder;
    }
    if (!folder) {
      return err({
        reason: "OPCUA_FOLDER_NOT_FOUND",
        cause: `no opcua folder at ${next.folderId}`,
      } as const satisfies NeverThrowError);
    }

    const rebuilt = this.tagConfigError(Tag.create(this.opcuaServer, folder, next));
    this.#tags.set(id, rebuilt);
    this.#trackValue(rebuilt);

    if (rebuilt.isOk()) {
      if (next.udtDefinitionId) {
        for (const child of preservedChildren) {
          rebuilt.value.attachRuntimeChild(child);
        }
        rebuilt.value.recomputeFromChildren();
      }

      if (next.parentTagId) {
        const parent = this.#tags.get(next.parentTagId);
        if (parent?.isOk()) {
          parent.value.attachRuntimeChild(rebuilt.value);
          parent.value.recomputeFromChildren();
        }
      }
    }

    this.rebuildPaths();

    if (rebuilt.isErr()) return err(rebuilt.error);
    return ok(rebuilt);
  }

  /**
   * Deletes a tag and its subtree from the database and disposes their runtime instances.
   *
   * @param id - Id of the tag to delete.
   * @returns Ok(true) on success, or Err when the tag is missing or the DB delete fails.
   */
  deleteTag(id: string) {
    const tag = this.#tags.get(id);
    if (!tag) {
      return err({
        reason: "TAG_NOT_FOUND",
        cause: `Tag not found at ${id}`,
      } as const satisfies NeverThrowError);
    }

    const childIds = [...this.#collectSubtreeOptions(id).keys()];
    const written = attempt(() =>
      db
        .delete(tables.tags)
        .where(inArray(tables.tags.id, [id, ...childIds]))
        .run(),
    );
    if (written.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(written.error),
      } as const satisfies NeverThrowError);
    }

    if (tag.isOk()) {
      const options = tag.value.options;
      if (options.parentTagId) {
        const parent = this.#tags.get(options.parentTagId);
        if (parent?.isOk()) parent.value.detachRuntimeChild(options.name);
      }
      const disposed = tag.value.dispose();
      if (disposed.isErr()) logger.error(disposed.error);
    }
    this.#tags.delete(id);
    for (const childId of childIds) this.#tags.delete(childId);
    return ok(true);
  }

  /**
   * Checks whether another loaded tag with the same name exists in the same parent or folder.
   *
   * @param tag - Options of the tag being created or updated.
   * @param folder - Folder the tag will live in.
   * @returns Ok(true) when no duplicate exists, or Err when a duplicate is found.
   */
  checkDuplicate(tag: TagOptionsInput, folder: OpcuaFolder) {
    for (const item of this.#tags.values()) {
      const options = this.#optionsOf(item);
      if (options.name !== tag.name) continue;
      if (options.parentTagId && tag.parentTagId) {
        if (options.parentTagId === tag.parentTagId) {
          return err({
            reason: "DUPLICATE_TAG",
            cause: `Duplicate tag ${tag.id} ${tag.name}`,
          } as const satisfies NeverThrowError);
        }
        continue;
      }
      if (item.isOk() && item.value.opcuaFolder.node.parentId === folder.node.parentId) {
        return err({
          reason: "DUPLICATE_TAG",
          cause: `Duplicate tag ${tag.id} ${tag.name}`,
        } as const satisfies NeverThrowError);
      }
    }
    return ok(true);
  }

  /**
   * Wraps a failed tag creation result with the `TAG_CONFIG_ERROR` reason.
   *
   * @param newTag - Tag result to inspect.
   * @returns Ok with the tag instance, or Err with a config error preserving its options.
   */
  tagConfigError(newTag: Result<Tag, FailedTag>) {
    if (newTag.isErr()) {
      return err({
        reason: "TAG_CONFIG_ERROR",
        cause: newTag.error,
        options: newTag.error.options,
      } as const satisfies FailedTag);
    }
    return ok(newTag.value);
  }

  /**
   * Rebuilds all tags whose driver path points at the given device.
   *
   * @param deviceName - Device name whose tags should be rebuilt.
   * @returns Ids of the tags that were reloaded successfully.
   */
  reloadTagsForDevice(deviceName: string) {
    const reloaded: string[] = [];
    for (const tag of this.getAllTags()) {
      const options = this.#optionsOf(tag);
      if (!options.driverPath) continue;
      if (resolveDevicePath(options.driverPath).deviceName !== deviceName) continue;
      const rebuilt = this.updateTag(options.id, { ...options });
      if (rebuilt.isErr()) {
        logger.error(neverThrowErrorToString(rebuilt.error));
        continue;
      }
      reloaded.push(options.id);
    }
    return reloaded;
  }

  /**
   * Loads all tag rows from the database, normalizes legacy keys and builds runtime tags.
   *
   * @returns Ok(true) on success, or Err when reading tags from the database fails.
   */
  async loadAllFromDb() {
    if (!this.opcuaServer) throw Error(`[TagManager] loadAllFromDb() opcuaServer not initalised`);
    if (!this.#folderManager)
      throw Error(`[TagManager] loadAllFromDb() folderManager not initalised`);

    const tagOptions = await attempt(() => db.query.tags.findMany());
    if (tagOptions.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(tagOptions.error),
      } as const satisfies NeverThrowError);
    }

    this.#tags.clear();
    const rows = (tagOptions.data as TagOptionsInput[]).map((row) => {
      const normalized = normalizeTagOptions(row);
      if (normalized.changed) {
        const written = attempt(() =>
          db
            .update(tables.tags)
            .set({
              bindings: normalized.value.bindings,
              udtOverrides: normalized.value.udtOverrides as Record<string, unknown> | null,
            })
            .where(eq(tables.tags.id, row.id))
            .run(),
        );
        if (written.isErr) logger.error(written.error);
      }
      return normalized.value;
    });
    const rowMap = new Map(rows.map((row) => [row.id, row]));
    const roots = rows.filter((row) => !row.parentTagId);
    const children = rows.filter((row) => row.parentTagId);

    for (const row of [...roots, ...children]) {
      const folder = this.#folderForRow(row, rowMap);
      if (!folder) continue;
      const tag = this.tagConfigError(Tag.create(this.opcuaServer, folder, row));
      this.#tags.set(row.id, tag);
      this.#trackValue(tag);
    }

    for (const row of [...children].reverse()) {
      const child = this.#tags.get(row.id);
      const parent = row.parentTagId ? this.#tags.get(row.parentTagId) : undefined;
      if (child?.isOk() && parent?.isOk()) parent.value.attachRuntimeChild(child.value);
    }

    for (const row of [...rows].reverse()) {
      const tag = this.#tags.get(row.id);
      if (tag?.isOk() && Object.keys(tag.value.children).length > 0)
        tag.value.recomputeFromChildren();
    }

    this.rebuildPaths();
    logger.info(`[TagManager] loaded ${tagOptions.data.length} tags from database`);
    return ok(true);
  }
}
