import type { OPCUAServer, UAObject } from "node-opcua";
import { TagNode } from "../../client/tag/clientTag.svelte";
import { logger } from "../pino/logger";
import { Tag, type TagOptionsInput } from "./tag";
import { db } from "../sqlite/db";
import { tables } from "../sqlite/tables";
import { eq } from "drizzle-orm";

export class TagManager {
  opcuaServer?: OPCUAServer;
  tagFolder?: UAObject;
  private tags: Map<string, Tag<any>> = new Map();
  private pathToId: Map<string, string> = new Map();

  constructor() {}

  initOpcuaServer(opcuaServer: OPCUAServer) {
    this.opcuaServer = opcuaServer;
    this.tagFolder = this.opcuaServer.engine.addressSpace
      ?.getOwnNamespace()
      .addObject({
        organizedBy: this.opcuaServer.engine.addressSpace?.rootFolder.objects,
        browseName: "Tags",
      });
  }

  async createTag(
    opts: TagOptionsInput<any>,
    writeToDb: boolean = true,
  ): Promise<Tag<any>> {
    if (!this.opcuaServer || !this.tagFolder) {
      throw new Error(
        `[TagManager] createTag() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    const tag = new Tag(this.opcuaServer, this.tagFolder, opts);

    if (writeToDb) {
      if (this.tags.has(tag.id)) {
        throw new Error(
          `[TagManager] createTag() Tag already exists at ${tag.id}`,
        );
      }

      db.insert(tables.tag).value(tag.options).run();

      this.pathToId.set(tag.path, id);
    }

    this.tags.set(tag.path, tag);

    logger.info(`[TagManager] added tag ${tag.path}`);

    return tag;
  }

  // -------------------------
  // Read Helpers
  // -------------------------

  getNode(path: string): Tag<any> | undefined {
    return this.tags.get(path);
  }

  getTag(path: string): Tag<any> | undefined {
    const [parentPath, propertyName] = path.split(".", 2);
    const node = this.tags.get(parentPath);
    if (!(node instanceof Tag)) return undefined;
    if (propertyName && node.type == "UdtTag") {
      return node.childTags.get(propertyName);
    }
    return node;
  }

  getAllTags(): Tag<any>[] {
    return Array.from(this.tags.values());
  }

  getAllChildrenAsNode(path: string): TagNode[] {
    return Array.from(this.tags.values())
      .filter((t) => t.parentPath === path)
      .map((tag) => ({
        name: tag.name,
        path: tag.path,
        parentPath: tag.parentPath,
        type: tag.type,
      }));
  }

  // -------------------------
  // Update Functions
  // -------------------------

  async updateTag(
    id: string,
    tagUpdates: TagOptionsInput<any>,
  ): Promise<Tag<any> | null> {
    if (!this.opcuaServer || !this.tagFolder) {
      throw new Error(
        `[TagManager] updateTag() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    this.tags.delete(id);
    const updatedTag = new Tag(this.opcuaServer, this.tagFolder, updates);

    let oldPath = path;
    if (oldPath !== updatedTag.path) {
      if (id) {
        db.delete(tables.tag).where(eq(tables.tag.id, id)).run();
        this.pathToId.delete(oldPath);
      }
      id = crypto.randomUUID();
      oldPath = updatedTag.path;
    }

    const dbValues = {
      name: updatedTag.name,
      dataType: updatedTag.resolvedOptions.dataType,
      nodeId: updatedTag.resolvedOptions.nodeId ?? null,
      writeable: updatedTag.resolvedOptions.writeable ?? true,
      exposeOverOpcua: updatedTag.resolvedOptions.exposeOverOpcua ?? true,
      parameters: updatedTag.resolvedOptions.parameters ?? null,
    };

    if (id) {
      db.update(tables.tag).set(dbValues).where(eq(tables.tag.id, id)).run();
    } else {
      id = crypto.randomUUID();
      db.insert(tables.tag)
        .values({ id, ...dbValues })
        .run();
    }

    this.pathToId.set(updatedTag.path, id);
    this.tags.set(updatedTag.path, updatedTag);

    return updatedTag;
  }

  // -------------------------
  // Move Functions
  // -------------------------

  async moveTag(
    oldPath: string,
    newParentPath: string,
    newName?: string,
  ): Promise<Tag<any> | null> {
    const oldTag = this.tags.get(oldPath);
    if (!(oldTag instanceof Tag)) return null;

    const name = newName ?? oldTag.name;
    const newPath = `${newParentPath}/${name}`;

    const id = this.pathToId.get(oldPath);
    if (id) {
      db.update(tables.tag).set({ name }).where(eq(tables.tag.id, id)).run();
      this.pathToId.delete(oldPath);
      this.pathToId.set(newPath, id);
    }

    this.tags.delete(oldPath);
    oldTag.name = name;
    oldTag.path = newPath;
    oldTag.parentPath = newParentPath;
    this.tags.set(newPath, oldTag);

    return oldTag;
  }

  // -------------------------
  // Delete Functions
  // -------------------------

  async deleteTag(id: string): Promise<boolean> {
    logger.trace(`[TagManager] deleteTag() ${id}`);
    if (id) {
      const result = db.delete(tables.tag).where(eq(tables.tag.id, id)).run();
      if (result.changes === 0) return false;
      this.pathToId.delete(id);
    }

    const tag = this.tags.get(id);
    if (tag) {
      tag.dispose();
      this.tags.delete(id);
    }
    return true;
  }

  // -------------------------
  // Bulk Loader
  // -------------------------

  async loadAllFromDb() {
    const rows = db.select().from(tables.tag).all();

    for (const row of rows) {
      if (this.tags.has(row.name)) continue;

      const opts = {
        name: row.name,
        parentPath: "/",
        dataType: row.dataType,
      } as TagOptionsInput<any>;

      const tag = new Tag(this.opcuaServer!, this.tagFolder, opts);
      this.pathToId.set(tag.path, row.id);
      this.tags.set(tag.path, tag);
    }

    logger.info(`[TagManager] loaded ${rows.length} tags from database`);
  }
}
