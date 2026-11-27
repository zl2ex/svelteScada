import type { OPCUAServer, UAObject } from "node-opcua";
import { logger } from "../pino/logger";
import { OpcuaFolder } from "./opcuaFolder";
import { tagFoldersClosureTable, type ClosureTableNode } from "../sqlite/util/tagClosureTable";
import { err, ok } from "neverthrow";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

export class FolderManager {
  opcuaServer: OPCUAServer | undefined;
  rootOpcuaFolderObject: UAObject | undefined;
  rootFolder: OpcuaFolder | undefined;
  #opcuaFolders: Map<string, OpcuaFolder> = new Map();

  /**
   * Creates a folder manager with no OPC UA folders loaded.
   */
  constructor() {}

  /**
   * Initialises the manager with the OPC UA server and creates the in-memory root folder.
   *
   * @param opcuaServer - Running OPC UA server that owns the address space.
   * @param rootFolder - OPC UA object under which top-level folders are organised.
   * @throws {NeverThrowError} when the root folder cannot be created.
   */
  initOpcuaServer(opcuaServer: OPCUAServer, rootFolder: UAObject) {
    this.opcuaServer = opcuaServer;
    this.rootOpcuaFolderObject = rootFolder;
    const root = this.#createOpcuaFolder({ id: "root", name: "root", parentId: null });
    if (root.isErr()) {
      throw root.error;
    }
    this.rootFolder = root.value;
  }

  /**
   * Creates the OPC UA object for a folder and caches it by folder id.
   *
   * @param folder - Closure-table node describing the folder and its parent.
   * @returns Ok with the created `OpcuaFolder`, or Err when creation fails.
   */
  #createOpcuaFolder(folder: ClosureTableNode) {
    if (!this.opcuaServer?.engine.addressSpace || !this.rootOpcuaFolderObject) {
      throw Error(
        `[FolderManager] createOpcuaFolder() ocpuaServer not initalised, call initOpcuaServer() first`,
      );
    }

    const parent =
      this.#opcuaFolders.get(folder.parentId ?? "")?.uaObject ?? this.rootOpcuaFolderObject;

    const result = OpcuaFolder.create(this.opcuaServer.engine.addressSpace, parent, folder);

    if (result.isErr()) return err(result.error);

    this.#opcuaFolders.set(folder.id, result.value);
    return ok(result.value);
  }

  /**
   * Disposes and forgets the cached OPC UA folder for an id.
   *
   * @param id - Id of the folder to dispose.
   * @returns Ok(true) when removed, or Err when the folder is missing or disposal fails.
   */
  #disposeOpcuaFolder(id: string) {
    const folder = this.#opcuaFolders.get(id);
    if (!folder)
      return err({
        reason: "OPCUA_FOLDER_NOT_FOUND",
        cause: `opcua folder at ${id} not found`,
      } as const satisfies NeverThrowError);

    const disposed = folder.dispose();
    if (disposed.isErr()) return err(disposed.error);

    this.#opcuaFolders.delete(id);
    return ok(true);
  }

  // ── DB + OPC UA CRUD ────────────────────────────────

  /**
   * Persists a new folder and creates its OPC UA object.
   *
   * @param newNode - Closure-table node to add.
   * @returns Ok with the created `OpcuaFolder`, or Err from the DB or OPC UA layer.
   */
  createFolder(newNode: ClosureTableNode) {
    const node = tagFoldersClosureTable.add(newNode);
    if (node.isErr()) return err(node.error);

    const folder = this.#createOpcuaFolder(node.value);
    if (folder.isErr()) return err(folder.error);

    logger.info(`[FolderManager] created folder ${folder.value.node.id}`);
    return ok(folder.value);
  }

  /**
   * Deletes a folder and its subtree from the DB and disposes its OPC UA object.
   *
   * @param id - Id of the folder to delete.
   * @returns Ok(true) on success, or Err from the DB or OPC UA layer.
   */
  deleteFolder(id: string) {
    const result = tagFoldersClosureTable.deleteRecursive(id);
    if (result.isErr()) return err(result.error);
    const dispose = this.#disposeOpcuaFolder(id);
    if (dispose.isErr()) return err(dispose.error);
    logger.info(`[FolderManager] deleted folder ${id}`);
    return ok(true);
  }

  /**
   * Renames a folder in OPC UA and the database.
   *
   * @param id - Id of the folder to rename.
   * @param newName - New display/browse name for the folder.
   * @returns Ok with the renamed DB row, or Err when the folder is missing or an update fails.
   */
  renameFolder(id: string, newName: string) {
    const folder = this.#opcuaFolders.get(id);
    if (!folder)
      return err({
        reason: "FOLDER_NOT_FOUND",
        cause: `Folder at ${id} not found`,
      } as const satisfies NeverThrowError);
    const rename = folder.rename(newName);
    if (rename.isErr()) return err(rename.error);

    const result = tagFoldersClosureTable.rename(id, newName);
    if (result.isErr()) return err(result.error);
    return ok(result.value);
  }

  /**
   * Moves a folder under a new parent, recreating its OPC UA object.
   *
   * The OPC UA object is disposed and recreated before the DB move; if the DB move fails, the
   * in-memory changes are rolled back.
   *
   * @param id - Id of the folder to move.
   * @param newParentId - Id of the new parent folder, or undefined for a root-level folder.
   * @returns Ok with the moved folder node, or Err when a lookup, dispose, create or move fails.
   */
  moveFolder(id: string, newParentId: string | undefined) {
    const oldDbFolder = tagFoldersClosureTable.get(id);
    if (oldDbFolder.isErr()) return err(oldDbFolder.error);

    const dispose = this.#disposeOpcuaFolder(id);
    if (dispose.isErr()) return err(dispose.error);

    const newFolder = {
      ...oldDbFolder.value,
      id,
      parentId: newParentId ?? null,
    };

    const recreated = this.#createOpcuaFolder(newFolder);
    if (recreated.isErr()) return err(recreated.error);

    const moveResult = tagFoldersClosureTable.move(id, newParentId);
    if (moveResult.isErr()) {
      // revert the changes to memory if the db operation fails
      const rollback = this.#disposeOpcuaFolder(id);
      if (rollback.isErr()) {
        return err({
          reason: "FOLDER_MOVE_ROLLBACK_FAILED",
          cause: `[FolderManager] moveFolder() failed to rollback folder ${id}: ${errorToString(
            rollback.error,
          )}`,
        } as const satisfies NeverThrowError);
      }
      const restore = this.#createOpcuaFolder(oldDbFolder.value);
      if (restore.isErr()) return err(restore.error);
      return err(moveResult.error);
    }

    logger.info(`[FolderManager] moved folder ${id} to ${newParentId}`);
    return ok(newFolder);
  }

  // ── Read helpers ────────────────────────────────────

  /**
   * Returns the cached folders whose node parent matches the given id.
   *
   * @param [parentId] - Parent folder id to match, defaults to null for root-level folders.
   * @returns Array of matching `OpcuaFolder` instances.
   */
  getAll(parentId: string | null = null) {
    return this.#opcuaFolders.values().filter((folder) => folder.node.parentId == parentId);
  }

  /**
   * Looks up a cached folder by id, falling back to the root folder for empty ids.
   *
   * @param id - Folder id to look up, or a falsy value for the root folder.
   * @returns The matching `OpcuaFolder`, the root folder, or undefined when not found.
   */
  get(id: string | null | undefined) {
    if (!id) return this.rootFolder;
    return this.#opcuaFolders.get(id);
  }

  // ── Bulk Loader ─────────────────────────────────────

  /**
   * Creates OPC UA objects for every folder stored in the database.
   *
   * @returns Ok(true) when loading completes; individual creation failures are logged.
   */
  loadAllFromDb() {
    const folders = tagFoldersClosureTable.getAll();
    if (folders.isErr()) return err(folders.error);
    for (const folder of folders.value) {
      const newFolder = this.#createOpcuaFolder(folder);
      if (newFolder.isErr()) {
        logger.error(newFolder.error);
      }
    }
    logger.info(`[FolderManager] loaded ${folders.value.length} folders from database`);
    return ok(true);
  }
}
