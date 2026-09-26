import { logger } from "../pino/logger";
import { UdtDefinition, type UdtDefinitionOptions } from "./udt";
import { err, ok } from "neverthrow";
import type { NeverThrowError } from "$lib/util/neverThrow";

export class UdtManager {
  udts: Map<string, UdtDefinition>;

  constructor() {
    this.udts = new Map();
  }

  async createUdt(opts: UdtDefinitionOptions, writeToDb: boolean = true) {
    if (writeToDb) {
      // SQLITE WIP
      const existing = {};
      // await collections.udts.findOne(
      //   { name: opts.name },
      //   { projection: { _id: 0 } }

      if (existing) {
        return err({
          reason: "UDT_ALREADY_EXISTS",
          cause: `[UdtManager] createUdt() Udt already exists at ${opts.name}`,
        } as const satisfies NeverThrowError);
      }
      // SQLITE WIP
      //await collections.udts.insertOne(opts);
    }

    const udt = new UdtDefinition(opts);
    this.udts.set(udt.name, udt);

    logger.info(`[UdtManager] added udt ${opts.name}`);

    return ok(udt);
  }

  getUdt(name: string) {
    return this.udts.get(name);
  }

  getAllUdts() {
    return this.udts.values().toArray();
  }

  getChildrenAsNode() {}

  async loadAllFromDb() {
    // SQLITE WIP

    const udts: UdtDefinitionOptions[] = [];
    // await collections.udts
    //   .find({}, { projection: { _id: 0 } })
    //   .toArray();
    for (const udt of udts) {
      // dont write to db as we are loading from it
      const created = await this.createUdt(udt, false);
      if (created.isErr()) {
        return err({
          reason: "UDT_CREATE_FAILED",
          cause: `[UdtManager] loadAllFromDb() ${created.error.reason} : ${created.error.cause}`,
        } as const satisfies NeverThrowError);
      }
    }

    logger.debug(`[UdtManager] loaded all udts from db`);
    return ok(undefined);
  }
}
