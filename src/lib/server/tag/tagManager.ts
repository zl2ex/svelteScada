import type { OPCUAServer, UAObject, UAObjectsFolder } from "node-opcua";
import { Node } from "../../client/tag/clientTag.svelte";
import { attempt } from "../../../lib/util/attempt";
import { collections } from "../mongodb/collections";
import { logger } from "../pino/logger";
import { TagFolder, type TagFolderOptions } from "./folder";
import { Tag, type TagOptionsInput } from "./tag";

// -------------------------
// In-Memory Index
// -------------------------

export class TreeIndex {
  nodes: Map<string, Tag<any> | TagFolder> = new Map();
  children: Map<string, Set<string>> = new Map();

  addNode(node: Tag<any> | TagFolder) {
    if (this.nodes.get(node.path))
      throw new Error(
        `[TreeIndex] addNode() Node at ${node.path} already exists`
      );
    this.nodes.set(node.path, node);

    if (!this.children.has(node.parentPath)) {
      this.children.set(node.parentPath, new Set());
    }
    this.children.get(node.parentPath)!.add(node.path);
    console.debug(this.children);
  }

  getNode(path: string): Tag<any> | TagFolder | undefined {
    return this.nodes.get(path);
  }

  removeNode(path: string) {
    const node = this.nodes.get(path);
    logger.trace(`[TreeIndex] removeNode() ${path}`);
    if (!node) return;
    node.dispose();

    // Remove from parent’s children
    const siblings = this.children.get(node.parentPath);
    if (siblings) {
      siblings.delete(path);
      if (siblings.size === 0) {
        this.children.delete(node.parentPath);
      }
    }

    // Remove node itself
    this.nodes.delete(path);
    this.children.delete(path); // cleanup children map if this was a parent
  }

  getChildren(parentPath: string): (Tag<any> | TagFolder)[] {
    const childPaths = this.children.get(parentPath);
    if (!childPaths) return [];
    return Array.from(childPaths).map((p) => this.nodes.get(p)!);
  }

  clear() {
    this.nodes.clear();
    this.children.clear();
  }
}

// -------------------------
// Create Functions (strict)
// -------------------------

export class TagManager {
  private tree: TreeIndex;
  opcuaServer?: OPCUAServer;
  tagFolder?: UAObject;

  constructor() {
    this.tree = new TreeIndex();

    // add root folder
    this.tree.addNode(new TagFolder({ name: "/", parentPath: "" }));
  }

  initOpcuaServer(opcuaServer: OPCUAServer) {
    this.opcuaServer = opcuaServer;
    this.tagFolder = this.opcuaServer.engine.addressSpace
      ?.getOwnNamespace()
      .addObject({
        organizedBy: this.opcuaServer.engine.addressSpace?.rootFolder.objects,
        browseName: "Tags",
      });
  }

  async createFolder(
    opts: TagFolderOptions,
    writeToDb: boolean = true
  ): Promise<TagFolder> {
    let node = new Node({ ...opts, type: "Folder" });

    if (writeToDb) {
      const existing = await collections.folders.findOne({ path: node.path });
      if (existing) {
        throw new Error(
          `[TagManager] createFolder() Folder already exists at ${node.path}`
        );
      }

      await collections.folders.insertOne(node);
    }

    const folder = new TagFolder(node);
    this.tree.addNode(folder);

    logger.debug(`[TagManager] added folder ${node.path}`);

    return folder;
  }

  async createTag(
    opts: TagOptionsInput<any>,
    writeToDb: boolean = true
  ): Promise<Tag<any>> {
    if (!this.opcuaServer || !this.tagFolder) {
      throw new Error(
        `[TagManager] createTag() opcuaServer not initalised, please call initOpcuaServer() first`
      );
    }

    let node = new Node({ ...opts, type: "Tag" });
    let doc: TagOptionsInput<any> = { ...opts, path: node.path };

    if (writeToDb) {
      const existing = await collections.tags.findOne({ path: node.path });
      if (existing) {
        throw new Error(
          `[TagManager] createTag() Tag already exists at ${node.path}`
        );
      }
      await collections.tags.insertOne(doc);
    }

    const tag = new Tag(this.opcuaServer, this.tagFolder, doc);
    this.tree.addNode(tag);

    logger.info(`[TagManager] added tag ${node.path}`);

    return tag;
  }

  // -------------------------
  // Read Helpers
  // -------------------------

  getNode(path: string): Tag<any> | TagFolder | undefined {
    return this.tree.getNode(path);
  }

  getTag(path: string): Tag<any> | undefined {
    const [parentPath, propertyName] = path.split(".", 2);
    const node = this.tree.getNode(parentPath);
    if (!(node instanceof Tag)) return undefined;
    if (propertyName && node.type == "UdtTag") {
      return node.children.get(propertyName);
    }
    return node;
  }

  getFolder(path: string): TagFolder | undefined {
    const node = this.tree.getNode(path);
    if (!(node instanceof TagFolder)) return undefined;
    return node;
  }

  getChildren(parentPath: string): (Tag<any> | TagFolder)[] {
    const node = this.tree.getNode(parentPath);
    if (node instanceof Tag && node.type == "UdtTag") {
      return node.children.values().toArray();
    }
    return this.tree.getChildren(parentPath);
  }

  getChildrenAsNode(parentPath: string): Node[] {
    logger.trace(
      `[TagManager] getChildrenAsNode() at parentPath ${parentPath}`
    );
    return this.getChildren(parentPath).map((child) => {
      return {
        name: child.name,
        path: child.path,
        parentPath: child.parentPath,
        type: child.type,
      };
    });
  }

  getAllTags(): Tag<any>[] {
    let tags: Tag<any>[] = [];
    let children = this.getChildren("/");
    while (children.length > 0) {
      const child = children.pop();
      if (child instanceof Tag) {
        tags.push(child);
      }
      if (child instanceof TagFolder) {
        for (const nested of this.getChildren(child.path)) {
          children.push(nested);
        }
      }
    }

    return tags;
  }

  // -------------------------
  // Update Functions
  // -------------------------

  async updateFolder(
    path: string,
    updates: TagFolderOptions
  ): Promise<TagFolder | null> {
    const result = await collections.folders.findOneAndUpdate(
      { path },
      { $set: updates },
      { returnDocument: "after" }
    );

    if (!result) return null;

    this.tree.removeNode(path);
    const updated = new TagFolder(result);
    this.tree.addNode(updated);

    return updated;
  }

  async updateTag(
    path: string,
    updates: TagOptionsInput<any>
  ): Promise<Tag<any> | null> {
    if (!this.opcuaServer || !this.tagFolder) {
      throw new Error(
        `[TagManager] createTag() opcuaServer not initalised, please call initOpcuaServer() first`
      );
    }
    this.tree.removeNode(path);
    const updatedTag = new Tag(this.opcuaServer, this.tagFolder, updates);

    let oldPath = path;
    if (oldPath !== updatedTag.path) {
      // new tag or changed name / parentPath
      this.deleteTag(oldPath);
      oldPath = updatedTag.path;
    }

    const result = await collections.tags.findOneAndUpdate(
      { path },
      { $set: updatedTag.options },
      { returnDocument: "after", upsert: true }
    );

    this.tree.addNode(updatedTag);

    if (!result) {
      throw new Error(`[TagManger] updateTag() failed to write to database`);
    }

    return updatedTag;
  }

  // -------------------------
  // Move Functions
  // -------------------------

  async moveTag(
    oldPath: string,
    newParentPath: string,
    newName?: string
  ): Promise<Tag<any> | null> {
    const oldTag = this.tree.getNode(oldPath);
    if (!(oldTag instanceof Tag)) return null;

    const name = newName ?? oldTag.name;
    const newPath = `${newParentPath}/${name}`;

    // Update DB
    const updated = await collections.tags.updateOne(
      { path: oldPath },
      { $set: { path: newPath, parentPath: newParentPath, name } }
    );

    // Update memory
    this.tree.removeNode(oldPath);
    oldTag.name = name;
    oldTag.path = newPath;
    oldTag.parentPath = newParentPath;
    this.tree.addNode(oldTag);

    return oldTag;
  }

  async moveFolder(
    oldPath: string,
    newParentPath: string,
    newName?: string
  ): Promise<TagFolder | null> {
    const oldFolder = this.tree.getNode(oldPath);
    if (!(oldFolder instanceof TagFolder)) return null;

    const name = newName ?? oldFolder.name;
    const newPath = `${newParentPath}/${name}`;

    // 1. Update folder itself in DB
    await collections.folders.updateOne(
      { path: oldPath },
      { $set: { path: newPath, parentPath: newParentPath, name } }
    );

    // 2. Update descendants
    const descendants = Array.from(this.tree.nodes.values()).filter((n) =>
      n.path.startsWith(oldPath + "/")
    );

    for (const d of descendants) {
      const relative = d.path.substring(oldPath.length);
      const updatedPath = newPath + relative;
      const newParent = updatedPath.substring(0, updatedPath.lastIndexOf("/"));

      if (d instanceof TagFolder) {
        await collections.folders.updateOne(
          { path: d.path },
          { $set: { path: updatedPath, parentPath: newParent } }
        );

        this.tree.removeNode(d.path);
        d.path = updatedPath;
        d.parentPath = newParent;
        this.tree.addNode(d);
      } else if (d instanceof Tag) {
        await collections.tags.updateOne(
          { path: d.path },
          { $set: { path: updatedPath, parentPath: newParent } }
        );

        this.tree.removeNode(d.path);
        d.path = updatedPath;
        d.parentPath = newParent;
        this.tree.addNode(d);
      }
    }

    // 3. Update folder itself in memory
    this.tree.removeNode(oldPath);

    oldFolder.path = newPath;
    oldFolder.name = name;
    oldFolder.parentPath = newParentPath;

    this.tree.addNode(oldFolder);

    return oldFolder;
  }

  // -------------------------
  // Delete Functions
  // -------------------------

  async deleteTag(path: string): Promise<boolean> {
    logger.trace(`[TagManager] deleteTag() ${path}`);
    const result = await collections.tags.deleteOne({ path: path });
    if (result.deletedCount === 0) return false;

    this.tree.removeNode(path);
    return true;
  }

  async deleteFolder(path: string): Promise<boolean> {
    const folder = this.tree.getNode(path);
    if (!(folder instanceof TagFolder)) return false;

    // Find all descendants (tags + folders)
    const descendants = Array.from(this.tree.nodes.values()).filter((n) =>
      n.path.startsWith(path + "/")
    );

    // Delete descendants from DB
    for (const d of descendants) {
      if (d instanceof TagFolder) {
        await collections.folders.deleteOne({ path: d.path });
      } else if (d instanceof Tag) {
        await collections.tags.deleteOne({ path: d.path });
      }
      this.tree.removeNode(d.path);
    }

    // Delete folder itself
    await collections.folders.deleteOne({ path });
    this.tree.removeNode(path);

    return true;
  }

  // -------------------------
  // Bulk Loader
  // -------------------------

  async loadAllFromDb(): Promise<TreeIndex> {
    const [folders, tags] = await Promise.all([
      await collections.folders.find().toArray(),
      await collections.tags.find().toArray(),
    ]);

    for (const f of folders) {
      const { data, error } = await attempt(() => this.createFolder(f, false));
      if (error)
        logger.error(`[TagManager] loadAllFromDb() ${f.path} ${error}`);
    }

    for (const t of tags) {
      const { data, error } = await attempt(() => this.createTag(t, false));
      if (error)
        logger.error(`[TagManager] loadAllFromDb() ${t.name} ${error}`);
    }

    logger.debug(`[TagManager] loaded all tags and folders from db`);

    return this.tree;
  }
}
