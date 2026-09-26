import { logger } from "../pino/logger";
import type { Tag } from "./tag";

export interface TagFolderOptions extends Omit<TagNode, "type"> {}

export class TagFolder extends TagNode {
  children: Map<string, TagFolder | Tag> = new Map();

  constructor(opts: Omit<TagFolderOptions, "path">) {
    super({ ...opts, type: "Folder" });
  }

  /* addChild(node: TagFolder | Tag) {
    this.children.set(node.name, node);
  }

  getChild(name: string): TagFolder | Tag | undefined {
    return this.children.get(name);
  }

  getChildren(): (TagFolder | Tag)[] {
    return this.children.values().toArray();
  }*/

  [Symbol.dispose]() {
    this.dispose();
  }

  dispose() {
    logger.debug(`[TagFolder] dispose() ${this.name}`);
    this.children.forEach((child) => {
      const disposed = child.dispose();
      if (disposed && disposed.isErr()) {
        logger.error(disposed.error);
      }
    });
  }
}
