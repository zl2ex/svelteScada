import type { OPCUAServer, UAObject, AddressSpace } from "node-opcua";
import { logger } from "../pino/logger";

export class OpcuaFolder {
  uaObject: UAObject;

  constructor(
    private addressSpace: AddressSpace,
    parent: UAObject,
    node: { id: string; name: string },
  ) {
    const namespace = addressSpace.getOwnNamespace();
    this.uaObject = namespace.addObject({
      organizedBy: parent,
      browseName: node.name,
      nodeId: `s=folder_${node.id}`,
    });
  }

  rename(newName: string) {
    (this.uaObject as any).browseName.value = newName;
  }

  dispose() {
    logger.trace(`[OpcuaFolder] dispose() ${this.uaObject.browseName.toString()}`);
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
