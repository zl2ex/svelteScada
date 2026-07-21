import type { OPCUAServer, UAObject } from "node-opcua";
import { logger } from "../pino/logger";
import { OpcuaFolder } from "./opcuaFolder";
import { db } from "../sqlite/db";
import { tables } from "../sqlite/tables";
import {
  tagFoldersClosureTable,
  type ClosureTableNode,
} from "../sqlite/util/tagClosureTable";

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
    if (!this.opcuaServer || !this.rootFolder) {
      throw Error(
        `[FolderManager] createOpcuaFolder() ocpuaServer not initalised, call initOpcuaServer() first`,
      );
    }

    const parent = folder.parentId
      ? this.opcuaFolders.get(folder.parentId)?.uaObject
      : this.rootFolder;

    const opcuaFolder = new OpcuaFolder(
      this.opcuaServer.engine.addressSpace!,
      parent,
      folder,
    );
    this.opcuaFolders.set(folder.id, opcuaFolder);
    return opcuaFolder;
  }

  private disposeOpcuaFolder(id: string) {
    const folder = this.opcuaFolders.get(id);
    if (folder) {
      folder.dispose();
      this.opcuaFolders.delete(id);
    }
  }

  // ── DB + OPC UA CRUD ────────────────────────────────

  createFolder(newNode: ClosureTableNode) {
    const node = tagFoldersClosureTable.add(newNode);
    const folder = this.createOpcuaFolder(node);
    logger.info(`[FolderManager] created folder ${folder?.node.id}`);
    return folder;
  }

  deleteFolder(id: string) {
    tagFoldersClosureTable.deleteRecursive(id);
    this.disposeOpcuaFolder(id);
    logger.info(`[FolderManager] deleted folder ${id}`);
  }

  renameFolder(id: string, newName: string) {
    tagFoldersClosureTable.rename(id, newName);
    this.opcuaFolders.get(id)?.rename(newName);
  }

  moveFolder(id: string, newParentId: string | undefined) {
    this.disposeOpcuaFolder(id);
    tagFoldersClosureTable.move(id, newParentId);
    const node = tagFoldersClosureTable.get(id);
    if (node) this.createOpcuaFolder(node);
  }

  // ── FK safety ───────────────────────────────────────

  ensureFolderExists(folderId: string | null | undefined): void {
    if (!folderId) return;
    if (this.opcuaFolders.has(folderId)) return;

    const existing = tagFoldersClosureTable.get(folderId);
    if (existing) {
      this.createOpcuaFolder(existing);
      return;
    }

    logger.warn(
      `[FolderManager] folder ${folderId} missing — creating stub to satisfy FK`,
    );
    db.insert(tables.tag_folders).values({ id: folderId, name: "stub" }).run();
    tagFoldersClosureTable.add({ id: folderId, name: "stub", parentId: null });
    const stub = tagFoldersClosureTable.get(folderId);
    if (stub) this.createOpcuaFolder(stub);
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

  async loadAllFromDb() {
    const folders = tagFoldersClosureTable.getAll();
    for (const folder of folders) {
      this.createOpcuaFolder(folder);
    }
    logger.info(`[FolderManager] loaded ${folders.length} folders to OPC UA`);
  }
}
