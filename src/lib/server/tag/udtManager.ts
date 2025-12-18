import type { OPCUAServer, UAObject } from "node-opcua";
import { Node } from "../../client/tag/clientTag.svelte";
import { attempt } from "../../../lib/util/attempt";
import { collections } from "../mongodb/collections";
import { logger } from "../pino/logger";
import { TagFolder, type TagFolderOptions } from "./folder";
import { Tag, type TagOptionsInput } from "./tag";
import { UdtDefinition, type UdtDefinitionOptions } from "./udt";
import { P } from "../../../../build/server/chunks/index2-yZtXfLL3";

export class UdtManager {
  udts: Map<string, UdtDefinition>;

  constructor() {
    this.udts = new Map();
  }

  async createUdt(
    opts: UdtDefinitionOptions,
    writeToDb: boolean = true
  ): Promise<UdtDefinition> {
    if (writeToDb) {
      const existing = await collections.udts.findOne({ name: opts.name });
      if (existing) {
        throw new Error(
          `[UdtManager] createUdt() Udt already exists at ${opts.name}`
        );
      }
      await collections.udts.insertOne(opts);
    }

    const udt = new UdtDefinition(opts);
    this.udts.set(udt.name, udt);

    logger.info(`[UdtManager] added udt ${opts.name}`);

    return udt;
  }

  async loadAllFromDb() {
    const udts = await collections.udts.find().toArray();

    udts.forEach((udt) => {
      // dont write to db as we are loading from it
      this.createUdt(udt, false);
    });

    logger.debug(`[UdtManager] loaded all udts from db`);
  }
}
