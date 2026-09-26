import { OPCUAServer } from "node-opcua";
import type { AddressSpace, UAVariable } from "node-opcua";
import { db } from "$lib/server/sqlite/db";
import { tables } from "$lib/server/sqlite/tables";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

export class OpcuaServerDriver {
  server: OPCUAServer | null = null;
  started = false;

  async start() {
    if (this.started) return ok(true);

    const created = attempt(
      () =>
        new OPCUAServer({
          port: 4840,
          resourcePath: "/UA/OPCUA",
          buildInfo: {
            productName: "InternalGateway",
            buildNumber: "1",
            buildDate: new Date(),
          },
        }),
    );
    if (created.error) {
      return err({
        reason: "OPCUA_SERVER_CREATE_FAILED",
        cause: errorToString(created.error),
      } as const satisfies NeverThrowError);
    }

    this.server = created.data;

    const initialised = await attempt(() => this.server!.initialize());
    if (initialised.error) {
      return err({
        reason: "OPCUA_SERVER_INIT_FAILED",
        cause: errorToString(initialised.error),
      } as const satisfies NeverThrowError);
    }

    this.started = true;

    const addressSpace = this.server.engine.addressSpace;
    if (addressSpace) {
      const built = this.#buildAddressSpace(addressSpace);
      if (built.isErr()) {
        this.started = false;
        return err(built.error);
      }
    }

    const listening = await attempt(() => this.server!.start());
    if (listening.error) {
      this.started = false;
      return err({
        reason: "OPCUA_SERVER_START_FAILED",
        cause: errorToString(listening.error),
      } as const satisfies NeverThrowError);
    }

    process.on("SIGTERM", () => {
      void this.stop().then((stopped) => {
        if (stopped.isErr()) {
          console.error(stopped.error);
        }
      });
    });
    process.on("SIGINT", () => {
      void this.stop().then((stopped) => {
        if (stopped.isErr()) {
          console.error(stopped.error);
        }
      });
    });

    return ok(true);
  }

  #buildAddressSpace(addressSpace: AddressSpace) {
    const allTags = attempt(() => db.select().from(tables.tags).all());
    if (allTags.error) {
      return err({
        reason: "OPCUA_ADDRESS_SPACE_BUILD_FAILED",
        cause: errorToString(allTags.error),
      } as const satisfies NeverThrowError);
    }

    return ok(true);
  }

  async stop() {
    const shutdown = await attempt(() => this.server?.shutdown(1000));
    if (shutdown.error) {
      return err({
        reason: "OPCUA_SERVER_STOP_FAILED",
        cause: errorToString(shutdown.error),
      } as const satisfies NeverThrowError);
    }
    this.started = false;

    return ok(true);
  }

  deleteOpcuaVariable(addressSpace: AddressSpace, varible: UAVariable) {
    if (!varible) return ok(true);

    // The node may already have been removed from the address space, e.g. by a
    // recursive deleteNode() on a parent folder or by a previous dispose call.
    // Once deleted, node-opcua nulls the node's internal addressSpace reference,
    // so calling findReferences() on it throws. Skip it if it's already gone.
    const found = attempt(() => addressSpace.findNode(varible.nodeId));
    if (found.error) {
      return err({
        reason: "OPCUA_VARIABLE_DELETE_FAILED",
        cause: errorToString(found.error),
      } as const satisfies NeverThrowError);
    }
    if (found.data !== varible) return ok(true);

    // Find its parent
    const parents = attempt(() =>
      varible.findReferences("HasComponent", false),
    );
    if (parents.error) {
      return err({
        reason: "OPCUA_VARIABLE_DELETE_FAILED",
        cause: errorToString(parents.error),
      } as const satisfies NeverThrowError);
    }

    for (const p of parents.data) {
      const parentNode = attempt(() => addressSpace.findNode(p.nodeId));
      if (parentNode.error) {
        return err({
          reason: "OPCUA_VARIABLE_DELETE_FAILED",
          cause: errorToString(parentNode.error),
        } as const satisfies NeverThrowError);
      }

      if (parentNode.data) {
        const removed = attempt(() =>
          parentNode.data!.removeReference({
            referenceType: "HasComponent",
            isForward: true,
            nodeId: varible,
          }),
        );
        if (removed.error) {
          return err({
            reason: "OPCUA_VARIABLE_DELETE_FAILED",
            cause: errorToString(removed.error),
          } as const satisfies NeverThrowError);
        }
      }
    }

    const listeners = attempt(() => varible.removeAllListeners());
    if (listeners.error) {
      return err({
        reason: "OPCUA_VARIABLE_DELETE_FAILED",
        cause: errorToString(listeners.error),
      } as const satisfies NeverThrowError);
    }

    const deleted = attempt(() => addressSpace.deleteNode(varible));
    if (deleted.error) {
      return err({
        reason: "OPCUA_VARIABLE_DELETE_FAILED",
        cause: errorToString(deleted.error),
      } as const satisfies NeverThrowError);
    }

    return ok(true);
  }
}
