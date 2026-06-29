import type { OPCUAServer, UAObject } from "node-opcua";
import { TagNode } from "../../client/tag/clientTag.svelte";
import { attempt } from "../../../lib/util/attempt";
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
        `[TreeIndex] addNode() Node at ${node.path} already exists`,
      );
    this.nodes.set(node.path, node);

    if (!this.children.has(node.parentPath)) {
      this.children.set(node.parentPath, new Set());
    }
    this.children.get(node.parentPath)!.add(node.path);
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

  async createFolder(opts: TagFolderOptions, writeToDb: boolean = true) {
    throw Error("createFolder() not implimentsd");
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

    let node = new TagNode({ ...opts, type: "Tag" });
    let doc: TagOptionsInput<any> = { ...opts, path: node.path };

    if (writeToDb) {
      // SQLITE WIP
      const existing = {};
      // const existing = await collections.tags.findOne(
      //   { path: node.path },
      //   { projection: { _id: 0 } },
      // );
      if (existing) {
        throw new Error(
          `[TagManager] createTag() Tag already exists at ${node.path}`,
        );
      }
      // SQLITE WIP

      //await collections.tags.insertOne(doc);
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
      return node.childTags.get(propertyName);
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
      return node.childTags.values().toArray();
    }
    return this.tree.getChildren(parentPath);
  }

  getChildrenAsNode(parentPath: string): TagNode[] {
    return this.getChildren(parentPath).map((child) => {
      return {
        name: child.name,
        path: child.path,
        parentPath: child.parentPath,
        type: child.type,
      };
    });
  }

  getAllChildrenAsNode(parentPath: string): TagNode[] {
    const children = this.getChildrenAsNode(parentPath);

    return children.map((node) => {
      // If this node can have children, recurse
      const grandChildren = this.getChildrenAsNode(node.path);

      if (grandChildren.length > 0) {
        return {
          ...node,
          children: this.getAllChildrenAsNode(node.path),
        };
      }

      return node;
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
    updates: TagFolderOptions,
  ): Promise<TagFolder | null> {
    const result = {};
    // SQLITE WIP

    // const result = await collections.folders.findOneAndUpdate(
    //   { path: path },
    //   { $set: updates },
    //   { returnDocument: "after", projection: { _id: 0 } },
    // );

    if (!result) return null;

    this.tree.removeNode(path);
    const updated = new TagFolder(result);
    this.tree.addNode(updated);

    return updated;
  }

  async updateTag(
    tagPath: string,
    tagUpdates: TagOptionsInput<any>,
  ): Promise<Tag<any> | null> {
    if (!this.opcuaServer || !this.tagFolder) {
      throw new Error(
        `[TagManager] updateTag() opcuaServer not initalised, please call initOpcuaServer() first`,
      );
    }

    let path = tagPath;
    let updates = tagUpdates;

    const [parentPath, propertyName] = path.split(".", 2);
    const node = this.tree.getNode(parentPath);
    if (propertyName && node instanceof Tag && node.type == "UdtTag") {
      // TD WIP

      // update the parent udt not the property
      path = parentPath;
      let udtParentTag = this.getTag(path);
      if (!(udtParentTag instanceof Tag))
        throw new Error(
          `[TagManager] updateTag() UdtTag ${parentPath} does not exist`,
        );

      updates = udtParentTag.options; // copy all properties of udtParentTag
      if (!updates.children) updates.children = {};
      updates.children[tagUpdates.name] = tagUpdates; // only copy overrides as that is the only thing we can edit

      logger.trace(
        `[TagManager] updateTag() child of UdtTag ${parentPath}.${propertyName} update overrides ${updates.children}`,
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

    const result = {};
    // SQLITE WIP

    // const result = await collections.tags.findOneAndUpdate(
    //   { path },
    //   { $set: updatedTag.options },
    //   { returnDocument: "after", upsert: true, projection: { _id: 0 } },
    // );

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
    newName?: string,
  ): Promise<Tag<any> | null> {
    const oldTag = this.tree.getNode(oldPath);
    if (!(oldTag instanceof Tag)) return null;

    const name = newName ?? oldTag.name;
    const newPath = `${newParentPath}/${name}`;

    // Update DB
    const updated = {};
    // SQLITE WIP

    // const updated = await collections.tags.updateOne(
    //   { path: oldPath },
    //   { $set: { path: newPath, parentPath: newParentPath, name } },
    // );

    // Update memory
    this.tree.removeNode(oldPath);
    oldTag.name = name;
    oldTag.path = newPath;
    oldTag.parentPath = newParentPath;
    this.tree.addNode(oldTag);

    return oldTag;
  }

  // -------------------------
  // Delete Functions
  // -------------------------

  async deleteTag(path: string): Promise<boolean> {
    logger.trace(`[TagManager] deleteTag() ${path}`);
    const result = {};
    // SQLITE WIP

    //const result = await collections.tags.deleteOne({ path: path });
    if (result.deletedCount === 0) return false;

    this.tree.removeNode(path);
    return true;
  }

  // -------------------------
  // Bulk Loader
  // -------------------------

  async loadAllFromDb() {
    throw Error("loadAllFromDb() not implimented yet");
  }
}
