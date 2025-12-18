import { Node } from "../../client/tag/clientTag.svelte";
import { logger } from "../pino/logger";
import type { Tag } from "./tag";

export interface TagFolderOptions extends Omit<Node, "type"> {}

export class TagFolder extends Node {
  children: Map<string, TagFolder | Tag<any>> = new Map();

  constructor(opts: Omit<TagFolderOptions, "path">) {
    super({ ...opts, type: "Folder" });
  }

  /* addChild(node: TagFolder | Tag<any>) {
    this.children.set(node.name, node);
  }

  getChild(name: string): TagFolder | Tag<any> | undefined {
    return this.children.get(name);
  }

  getChildren(): (TagFolder | Tag<any>)[] {
    return this.children.values().toArray();
  }*/

  [Symbol.dispose]() {
    this.dispose();
  }

  dispose() {
    logger.debug(`[TagFolder] dispose() ${this.name}`);
    this.children.forEach((child) => {
      child.dispose();
    });
  }
}
