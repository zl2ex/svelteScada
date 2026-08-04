import type { UAObject, AddressSpace } from "node-opcua";
import { logger } from "../pino/logger";
import type { ClosureTableNode } from "../sqlite/util/tagClosureTable";
import { err, ok, type Result } from "neverthrow";
import { tryCatch } from "$lib/util/tryCatch";

export class OpcuaFolder {
  node: ClosureTableNode;
  uaObject: UAObject;

  private constructor(
    private addressSpace: AddressSpace,
    node: ClosureTableNode,
    uaObject: UAObject,
  ) {
    this.node = node;
    this.uaObject = uaObject;
  }

  static create(
    addressSpace: AddressSpace,
    parent: UAObject,
    node: ClosureTableNode,
  ) {
    const result = tryCatch(() => {
      const namespace = addressSpace.getOwnNamespace();
      const nodeId = `s=folder_${node.id}`;

      const existing = addressSpace.findNode(nodeId);
      if (existing) {
        addressSpace.deleteNode(existing);
      }

      const uaObject = namespace.addObject({
        organizedBy: parent,
        browseName: node.name,
        nodeId,
      });

      return new OpcuaFolder(addressSpace, node, uaObject);
    });

    if (result.error) {
      return err({
        reason: "OPCUA_FOLDER_CREATE_FAILED",
        cause: result.error,
      } as const);
    }

    return ok(result.value);
  }

  rename(newName: string) {
    const result = tryCatch(() => {
      this.node.name = newName;
      this.uaObject.setDisplayName(newName);
      // TD WIP Maybe delete and create a new node with browseName updated as well ??
    });

    if (result.error) {
      return err({
        reason: "OPCUA_RENAME_FAILED",
        cause: result.error,
      } as const);
    }

    return ok(result.value);
  }

  dispose() {
    const result = tryCatch(() => {
      logger.trace(
        `[OpcuaFolder] dispose() ${this.uaObject.browseName.toString()}`,
      );
      this.uaObject.removeAllListeners();

      const parents = this.uaObject.findReferences("HasComponent", false);
      for (const p of parents) {
        const parentNode = this.addressSpace.findNode(p.nodeId);
        if (parentNode) {
          const removed = tryCatch(() =>
            parentNode.removeReference({
              referenceType: "HasComponent",
              isForward: true,
              nodeId: this.uaObject,
            }),
          );
          //if(removed.error) // do nothing with the error at this stage WIP
        }
      }
      this.addressSpace.deleteNode(this.uaObject);
      return true;
    });

    if (result.error) {
      return err({
        reason: "OPCUA_DISPOSE_FAILED",
        cause: result.error,
      } as const);
    }

    return ok(result.value);
  }
}
