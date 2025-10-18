import {
  Node,
  type NodeOptions,
} from "../../../lib/client/tag/tagState.svelte";
import type { Tag } from "./tag";

export interface TagFolderOptions extends Omit<NodeOptions, "type"> {}

export class TagFolder extends Node {
  children: Map<string, TagFolder | Tag<any>> = new Map();

  constructor(opts: TagFolderOptions) {
    opts.type = "Folder";
    super(opts);
    this.name = opts.name;
    this.path = opts.path;
  }

  addChild(node: TagFolder | Tag<any>) {
    this.children.set(node.name, node);
  }

  getChild(name: string): TagFolder | Tag<any> | undefined {
    return this.children.get(name);
  }
}
