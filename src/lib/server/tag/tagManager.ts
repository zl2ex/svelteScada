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
import type { UdtTagOverrides } from "./tag";

type PreservedTag = {
  options: TagOptionsInput;
  value?: TagValue;
  overrides?: UdtTagOverrides | null;
};

export class TagManager {
  opcuaServer?: OPCUAServer;
  #tags: Map<string, Result<Tag, FailedTag>> = new Map();
  #folderManager: FolderManager | undefined;

  constructor() {}

  initOpcuaServer(opcuaServer: OPCUAServer, folderManager: FolderManager) {
    this.opcuaServer = opcuaServer;
    this.#folderManager = folderManager;
  }

  #optionsOf(tag: Result<Tag, FailedTag>): TagOptionsInput {
    return tag.isOk() ? tag.value.options : tag.error.options;
  }

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

  #pathOf(tag: Result<Tag, FailedTag>): string | undefined {
    if (tag.isOk()) return tag.value.path;
    return tag.error.options ? this.#buildPath(tag.error.options) : undefined;
  }

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

  #childrenOf(parentId: string) {
    return [...this.#tags.entries()].flatMap(([id, tag]) => {
      if (this.#optionsOf(tag).parentTagId !== parentId) return [];
      return [{ id, tag }];
    });
  }

  #collectSubtreeOptions(parentId: string, out = new Map<string, TagOptionsInput>()) {
    for (const { id, tag } of this.#childrenOf(parentId)) {
      out.set(id, { ...this.#optionsOf(tag) });
      this.#collectSubtreeOptions(id, out);
    }
    return out;
  }

  #collectPreserved(parentId: string, out = new Map<string, PreservedTag>()) {
    for (const { id, tag } of this.#childrenOf(parentId)) {
      out.set(id, {
        options: { ...this.#optionsOf(tag) },
        value: tag.isOk() ? tag.value.value : undefined,
        overrides: this.#optionsOf(tag).udtOverrides ?? null,
      });
      this.#collectPreserved(id, out);
    }
    return out;
  }

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

  getAllTags() {
    return Array.from(this.#tags.values());
  }

  getAllTagInstances() {
    return this.getAllTags().flatMap((tag) => (tag.isOk() ? [tag.value] : []));
  }

  getSubtreeOptions(id: string) {
    return [...this.#collectSubtreeOptions(id).values()];
  }

  idToPath(findId: string) {
    const tag = this.#tags.get(findId);
    return tag ? this.#pathOf(tag) : undefined;
  }

  rebuildPaths() {
    const visit = (tag: Result<Tag, FailedTag>) => {
      if (tag.isErr()) return;
      tag.value.path = this.#buildPath(tag.value.options);
      for (const child of this.#childrenOf(tag.value.id)) visit(child.tag);
    };

    for (const tag of this.#tags.values()) {
      if (!this.#optionsOf(tag).parentTagId) visit(tag);
    }
  }

  countUdtInstances(name: string) {
    return this.getAllTags().filter((tag) => this.#optionsOf(tag).dataType === name).length;
  }

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

  renameUdtDataType(oldName: string, newName: string) {
    for (const tag of this.#tags.values()) {
      const options = this.#optionsOf(tag);
      if (options.dataType === oldName) options.dataType = newName;
    }
  }

  #expandOptions(root: TagOptionsInput, preserved: Map<string, PreservedTag> = new Map()) {
    const rows: TagOptionsInput[] = [root];
    const definition =
      udtManager.getUdtById(root.udtDefinitionId ?? "") ?? udtManager.getUdt(root.dataType);
    if (!definition) return rows;

    const overridesByChildId: Record<string, UdtTagOverrides> = {};
    for (const child of definition.children) {
      const childId = `${root.id}:${child.id}`;
      const saved = preserved.get(childId);
      if (saved?.overrides) overridesByChildId[child.id] = saved.overrides;
    }

    for (const childOptions of definition.buildInstanceOptions(root, overridesByChildId)) {
      const saved = preserved.get(childOptions.id);
      if (saved) {
        childOptions.udtOverrides = saved.overrides ?? {};
        if (saved.value !== undefined && saved.options.dataType === childOptions.dataType) {
          childOptions.initalValue =
            typeof saved.value === "string" ? saved.value : JSON.stringify(saved.value);
        }
      }
      rows.push(...this.#expandOptions(childOptions, preserved));
    }

    return rows;
  }

  #writeRows(root: TagOptionsInput, rows: TagOptionsInput[], oldChildIds: string[] = []) {
    return attempt(() =>
      db.transaction((tx) => {
        tx.update(tables.tags).set(root).where(eq(tables.tags.id, root.id)).run();
        if (oldChildIds.length > 0) {
          tx.delete(tables.tags).where(inArray(tables.tags.id, oldChildIds)).run();
        }
        for (const row of rows.slice(1)) {
          tx.insert(tables.tags).values(row).run();
        }
      }),
    );
  }

  #folderForRow(row: TagOptionsInput, rowMap: Map<string, TagOptionsInput>) {
    let current = row;
    while (current.parentTagId) {
      const parent = rowMap.get(current.parentTagId);
      if (!parent) break;
      current = parent;
    }
    return this.#folderManager?.get(current.folderId);
  }

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

    const definition = udtManager.getUdt(opts.dataType);
    if (definition) {
      opts = { ...opts, udtDefinitionId: definition.id, type: "udtTag" };
    }

    const rows = this.#expandOptions(opts);
    if (writeToDb) {
      const written = attempt(() =>
        db.transaction((tx) => {
          for (const row of rows) tx.insert(tables.tags).values(row).run();
        }),
      );
      if (written.isErr) {
        return err({
          reason: "DB_ERROR",
          cause: errorToString(written.error),
        } as const satisfies NeverThrowError);
      }
    }

    const created = this.#buildRuntime(rows);
    const root = created.get(opts.id);
    if (!root)
      return err({
        reason: "TAG_CREATE_FAILED",
        cause: "root tag not created",
      } as const satisfies NeverThrowError);
    if (root.isErr()) return err(root.error);
    return ok(root);
  }

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
      next.type = "udtTag";
    }

    if (oldOptions.udtDefinitionChildId) {
      const definition = udtManager.getUdtById(oldOptions.udtDefinitionId ?? "");
      const child = definition?.getChild(oldOptions.udtDefinitionChildId);
      if (definition && child) {
        const oldOverrides = oldOptions.udtOverrides ?? {};
        const requestedOverrides = tagUpdates.udtOverrides;
        const overrides: UdtTagOverrides = {
          ...(requestedOverrides ?? oldOverrides),
        };

        if (requestedOverrides) {
          for (const key of Object.keys(oldOverrides)) {
            if (!(key in requestedOverrides)) {
              (next as Record<string, unknown>)[key] = (child as Record<string, unknown>)[key];
            }
          }
        }

        for (const [key, value] of Object.entries(next)) {
          if (
            [
              "id",
              "parentTagId",
              "udtDefinitionId",
              "udtDefinitionChildId",
              "udtOverrides",
              "type",
            ].includes(key)
          )
            continue;
          const oldValue = (oldOptions as Record<string, unknown>)[key];
          if (oldValue === value) continue;
          const definitionValue = (child as Record<string, unknown>)[key];
          if (value === definitionValue) delete (overrides as Record<string, unknown>)[key];
          else (overrides as Record<string, unknown>)[key] = value;
        }
        next.udtOverrides = overrides;
      }
    }

    const oldChildren = this.#collectSubtreeOptions(id);
    const oldChildIds = [...oldChildren.keys()];
    const preserved = this.#collectPreserved(id);
    const rows = this.#expandOptions(next, preserved);

    if (oldOptions.parentTagId) {
      const parent = this.#tags.get(oldOptions.parentTagId);
      if (parent?.isOk()) parent.value.detachRuntimeChild(oldOptions.name);
    }

    if (existing.isOk()) existing.value.dispose();
    this.#tags.delete(id);
    for (const childId of oldChildIds) this.#tags.delete(childId);

    const written = this.#writeRows(next, rows, oldChildIds);
    if (written.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(written.error),
      } as const satisfies NeverThrowError);
    }

    const created = this.#buildRuntime(rows);
    const root = created.get(id);
    if (!root)
      return err({
        reason: "TAG_UPDATE_FAILED",
        cause: "root tag not created",
      } as const satisfies NeverThrowError);
    if (root.isErr()) return err(root.error);
    return ok(root);
  }

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

  reloadTagsForDevice(deviceName: string) {
    const reloaded: string[] = [];
    for (const tag of this.getAllTags()) {
      const options = this.#optionsOf(tag);
      if (!options.nodeId) continue;
      if (resolveDevicePath(options.nodeId).deviceName !== deviceName) continue;
      const rebuilt = this.updateTag(options.id, { ...options });
      if (rebuilt.isErr()) {
        logger.error(neverThrowErrorToString(rebuilt.error));
        continue;
      }
      reloaded.push(options.id);
    }
    return reloaded;
  }

  rebuildAllUdtInstances() {
    const before = new Map(
      this.getAllTags().map((tag) => {
        const options = this.#optionsOf(tag);
        return [options.id, options] as const;
      }),
    );
    const rebuilt: string[] = [];
    for (const tag of this.getAllTags()) {
      const options = this.#optionsOf(tag);
      if (options.parentTagId || !options.udtDefinitionId) continue;
      const result = this.updateTag(options.id, { ...options });
      if (result.isOk()) rebuilt.push(options.id);
    }

    const upserted = this.getAllTags().map((tag) => this.#optionsOf(tag));
    const afterIds = new Set(upserted.map((options) => options.id));
    const removed = [...before.keys()].filter((id) => !afterIds.has(id));
    return { rebuilt, upserted, removed };
  }

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
    const rows = tagOptions.data as TagOptionsInput[];
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
