import type { UAObject, AddressSpace } from "node-opcua";
import { logger } from "../pino/logger";
import type { ClosureTableNode } from "../sqlite/util/tagClosureTable";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

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
    const result = attempt(() => {
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
        cause: errorToString(result.error),
      } as const satisfies NeverThrowError);
    }

    return ok(result.data);
  }

  rename(newName: string) {
    const result = attempt(() => {
      this.node.name = newName;
      this.uaObject.setDisplayName(newName);
      // TD WIP Maybe delete and create a new node with browseName updated as well ??
    });

    if (result.error) {
      return err({
        reason: "OPCUA_RENAME_FAILED",
        cause: errorToString(result.error),
      } as const satisfies NeverThrowError);
    }

    return ok(true);
  }

  dispose() {
    logger.trace(
      `[OpcuaFolder] dispose() ${this.uaObject.browseName.toString()}`,
    );

    const listeners = attempt(() => this.uaObject.removeAllListeners());
    if (listeners.error) {
      return err({
        reason: "OPCUA_DISPOSE_FAILED",
        cause: errorToString(listeners.error),
      } as const satisfies NeverThrowError);
    }

    const parents = attempt(() =>
      this.uaObject.findReferences("HasComponent", false),
    );
    if (parents.error) {
      return err({
        reason: "OPCUA_DISPOSE_FAILED",
        cause: errorToString(parents.error),
      } as const satisfies NeverThrowError);
    }

    for (const p of parents.data) {
      const parentNode = attempt(() => this.addressSpace.findNode(p.nodeId));
      if (parentNode.error) {
        return err({
          reason: "OPCUA_DISPOSE_FAILED",
          cause: errorToString(parentNode.error),
        } as const satisfies NeverThrowError);
      }

      if (parentNode.data) {
        const removed = attempt(() =>
          parentNode.data!.removeReference({
            referenceType: "HasComponent",
            isForward: true,
            nodeId: this.uaObject,
          }),
        );
        if (removed.error) {
          return err({
            reason: "OPCUA_DISPOSE_FAILED",
            cause: errorToString(removed.error),
          } as const satisfies NeverThrowError);
        }
      }
    }

    const deleted = attempt(() => this.addressSpace.deleteNode(this.uaObject));
    if (deleted.error) {
      return err({
        reason: "OPCUA_DISPOSE_FAILED",
        cause: errorToString(deleted.error),
      } as const satisfies NeverThrowError);
    }

    return ok(true);
  }
}
