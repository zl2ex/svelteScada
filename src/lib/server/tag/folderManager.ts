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
    const folder = this.createOpcuaFolder(newNode);
    try {
      tagFoldersClosureTable.add(newNode);
    } catch (e) {
      this.disposeOpcuaFolder(newNode.id);
      throw e;
    }
    logger.info(`[FolderManager] created folder ${folder?.node.id}`);
    return folder;
  }

  deleteFolder(id: string) {
    this.disposeOpcuaFolder(id);
    tagFoldersClosureTable.deleteRecursive(id);
    logger.info(`[FolderManager] deleted folder ${id}`);
  }

  renameFolder(id: string, newName: string) {
    this.opcuaFolders.get(id)?.rename(newName);
    tagFoldersClosureTable.rename(id, newName);
  }

  moveFolder(id: string, newParentId: string | undefined) {
    const node = tagFoldersClosureTable.get(id);
    if (!node) throw Error(`[FolderManager] moveFolder() cannot find node ${id}`);

    this.disposeOpcuaFolder(id);
    const newNode = { ...node, parentId: newParentId ?? null };
    this.createOpcuaFolder(newNode);

    try {
      tagFoldersClosureTable.move(id, newParentId);
    } catch (e) {
      this.disposeOpcuaFolder(id);
      this.createOpcuaFolder(node);
      throw e;
    }

    logger.info(`[FolderManager] moved folder ${id} to ${newParentId}`);
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
