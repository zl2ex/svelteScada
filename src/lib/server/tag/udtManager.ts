import { logger } from "../pino/logger";
import { UdtDefinition, type UdtDefinitionOptions } from "./udt";

export class UdtManager {
  udts: Map<string, UdtDefinition>;

  constructor() {
    this.udts = new Map();
  }

  async createUdt(
    opts: UdtDefinitionOptions,
    writeToDb: boolean = true,
  ): Promise<UdtDefinition> {
    if (writeToDb) {
      // SQLITE WIP
      const existing = {};
      // await collections.udts.findOne(
      //   { name: opts.name },
      //   { projection: { _id: 0 } }

      if (existing) {
        throw new Error(
          `[UdtManager] createUdt() Udt already exists at ${opts.name}`,
        );
      }
      // SQLITE WIP
      //await collections.udts.insertOne(opts);
    }

    const udt = new UdtDefinition(opts);
    this.udts.set(udt.name, udt);

    logger.info(`[UdtManager] added udt ${opts.name}`);

    return udt;
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

    const udts = [];
    // await collections.udts
    //   .find({}, { projection: { _id: 0 } })
    //   .toArray();
    udts.forEach((udt) => {
      // dont write to db as we are loading from it
      this.createUdt(udt, false);
    });

    logger.debug(`[UdtManager] loaded all udts from db`);
  }
}
