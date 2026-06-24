import { OPCUAServer } from "node-opcua";
import type { AddressSpace } from "node-opcua";
import { db } from "$lib/server/sqlite/db";
import { tables } from "$lib/server/sqlite/tables";
export class OpcuaServerDriver {
  server: OPCUAServer | null = null;
  started = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.server = new OPCUAServer({
      port: 4840,
      resourcePath: "/UA/OPCUA",
      buildInfo: {
        productName: "InternalGateway",
        buildNumber: "1",
        buildDate: new Date(),
      },
    });

    await this.server.initialize();
    this.#buildAddressSpace(this.server.engine.addressSpace!);
    await this.server.start();

    process.on("SIGTERM", () => void this.stop());
    process.on("SIGINT", () => void this.stop());
  }

  #buildAddressSpace(addressSpace: AddressSpace): void {
    const namespace = addressSpace.getOwnNamespace();
    const allTags = db.select().from(tables.tag).all();

    /*for (const tag of allTags) {
      namespace.addVariable({
        componentOf: addressSpace.rootFolder.objects,
        nodeId: `s=${tag.id}`,
        browseName: tag.name,
        dataType: "Double",
        value: {
          // Synchronous read — Drizzle + better-sqlite3 is sync
          get: () =>
            new Variant({
              dataType: DataType.Double,
              value:
                db
                  .select({ value: tags.value })
                  .from(tags)
                  .where(eq(tags.id, tag.id))
                  .get()?.value ?? 0,
            }),
          // Synchronous write then broadcast patch to all browser clients
          set: (variant: Variant) => {
            db.update(tags)
              .set({ value: variant.value as number, updatedAt: new Date() })
              .where(eq(tags.id, tag.id))
              .run();

            broadcastOpcuaTagUpdate(tag.id, variant.value as number);
            return StatusCodes.Good;
          },
        },
      });
    }*/
  }

  async stop(): Promise<void> {
    await this.server?.shutdown(1000);
  }

  deleteOpcuaVariable(addressSpace: AddressSpace, varible: UAVariable) {
    if (!varible) return;

    // Find its parent
    const parents = varible.findReferences("HasComponent", false);

    for (const p of parents) {
      const parentNode = addressSpace.findNode(p.nodeId);
      if (parentNode) {
        try {
          parentNode.removeReference({
            referenceType: "HasComponent",
            isForward: true,
            nodeId: varible,
          });
        } catch {}
      }
    }

    varible.removeAllListeners();
    addressSpace.deleteNode(varible);
  }
}
