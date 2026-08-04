import type { OPCUAServer, UAObject } from "node-opcua";
import { logger } from "../pino/logger";
import { OpcuaFolder } from "./opcuaFolder";
import {
  tagFoldersClosureTable,
  type ClosureTableNode,
} from "../sqlite/util/tagClosureTable";
import { err, ok } from "neverthrow";

export class FolderManager {
  opcuaServer: OPCUAServer | undefined;
  rootFolder: UAObject | undefined;
  private opcuaFolders: Map<string, OpcuaFolder> = new Map();

  constructor() {}

  initOpcuaServer(opcuaServer: OPCUAServer, rootFolder: UAObject) {
    this.opcuaServer = opcuaServer;
    this.rootFolder = rootFolder;
  }

  private createOpcuaFolder(folder: ClosureTableNode) {
    if (!this.opcuaServer?.engine.addressSpace || !this.rootFolder) {
      throw Error(
        `[FolderManager] createOpcuaFolder() ocpuaServer not initalised, call initOpcuaServer() first`,
      );
    }

    const parent =
      this.opcuaFolders.get(folder.parentId ?? "")?.uaObject ?? this.rootFolder;

    const result = OpcuaFolder.create(
      this.opcuaServer.engine.addressSpace,
      parent,
      folder,
    );

    if (result.isErr()) return err(result.error);

    this.opcuaFolders.set(folder.id, result.value);
    return ok(result.value);
  }

  private disposeOpcuaFolder(id: string) {
    const folder = this.opcuaFolders.get(id);
    if (!folder) return err({ reason: "FOLDER_NOT_FOUND" } as const);

    folder.dispose();
    this.opcuaFolders.delete(id);
    return ok(true);
  }

  // ── DB + OPC UA CRUD ────────────────────────────────

  createFolder(newNode: ClosureTableNode) {
    const node = tagFoldersClosureTable.add(newNode);
    if (node.isErr()) return err(node.error);

    const folder = this.createOpcuaFolder(node.value);
    if (folder.isErr()) return err(folder.error);

    logger.info(`[FolderManager] created folder ${folder.value.node.id}`);
    return ok(folder.value);
  }

  deleteFolder(id: string) {
    const result = tagFoldersClosureTable.deleteRecursive(id);
    if (result.isErr()) return err(result.error);
    const dispose = this.disposeOpcuaFolder(id);
    if (dispose.isErr()) return err(dispose.error);
    logger.info(`[FolderManager] deleted folder ${id}`);
    return ok(true);
  }

  renameFolder(id: string, newName: string) {
    const folder = this.opcuaFolders.get(id);
    if (!folder) return err({ reason: "FOLDER_NOT_FOUND" } as const);
    const rename = folder.rename(newName);
    if (rename.isErr()) return err(rename.error);

    const result = tagFoldersClosureTable.rename(id, newName);
    if (result.isErr()) return err(result.error);
    return ok(result.value);
  }

  moveFolder(id: string, newParentId: string | undefined) {
    const oldDbFolder = tagFoldersClosureTable.get(id);
    if (oldDbFolder.isErr()) return err(oldDbFolder.error);

    const dispose = this.disposeOpcuaFolder(id);
    if (dispose.isErr()) return err(dispose.error);

    const newFolder = {
      ...oldDbFolder.value,
      id,
      parentId: newParentId ?? null,
    };

    this.createOpcuaFolder(newFolder);

    const moveResult = tagFoldersClosureTable.move(id, newParentId);
    if (moveResult.isErr()) {
      // revert the changes to memory if the db operation fails
      this.disposeOpcuaFolder(id);
      this.createOpcuaFolder(oldDbFolder.value);
      return err(moveResult.error);
    }

    logger.info(`[FolderManager] moved folder ${id} to ${newParentId}`);
    return ok(newFolder);
  }

  // ── Read helpers ────────────────────────────────────

  getAll(parentId: string | null = null) {
    return this.opcuaFolders
      .values()
      .filter((folder) => folder.node.parentId == parentId);
  }

  get(id: string | null | undefined) {
    if (!id) return undefined;
    return this.opcuaFolders.get(id);
  }

  // ── Bulk Loader ─────────────────────────────────────

  loadAllFromDb() {
    const folders = tagFoldersClosureTable.getAll();
    if (folders.isErr()) return err(folders.error);
    for (const folder of folders.value) {
      const newFolder = this.createOpcuaFolder(folder);
      // if(newFolder.isErr()) // do nothing if it fails yet WIP
    }
    logger.info(
      `[FolderManager] loaded ${folders.value.length} folders to OPC UA`,
    );
    return ok(true);
  }
}
