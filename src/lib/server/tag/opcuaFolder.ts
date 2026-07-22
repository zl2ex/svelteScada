import type { UAObject, AddressSpace } from "node-opcua";
import { logger } from "../pino/logger";
import type { ClosureTableNode } from "../sqlite/util/tagClosureTable";

export class OpcuaFolder {
  node: ClosureTableNode;
  // id: string;
  //   // name: string;
  // parentId: string | null = null;
  uaObject: UAObject;

  constructor(
    private addressSpace: AddressSpace,
    parent: UAObject,
    node: ClosureTableNode,
  ) {
    this.node = node;
    const namespace = addressSpace.getOwnNamespace();
    const nodeId = `s=folder_${node.id}`;

    const existing = addressSpace.findNode(nodeId);
    if (existing) {
      addressSpace.deleteNode(existing);
    }

    this.uaObject = namespace.addObject({
      organizedBy: parent,
      browseName: node.name,
      nodeId,
    });
  }

  rename(newName: string) {
    this.node.name = newName;
    this.uaObject.browseName.name = newName;
  }

  dispose() {
    logger.trace(
      `[OpcuaFolder] dispose() ${this.uaObject.browseName.toString()}`,
    );
    this.uaObject.removeAllListeners();

    const parents = this.uaObject.findReferences("HasComponent", false);
    for (const p of parents) {
      const parentNode = this.addressSpace.findNode(p.nodeId);
      if (parentNode) {
        try {
          parentNode.removeReference({
            referenceType: "HasComponent",
            isForward: true,
            nodeId: this.uaObject,
          });
        } catch {}
      }
    }
    this.addressSpace.deleteNode(this.uaObject);
  }
}
