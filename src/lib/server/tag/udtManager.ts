import { asc, eq } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";
import { db } from "$lib/server/sqlite/db";
import {
  tables,
  z_UdtDefinitionInput,
  type UdtDefinitionInput,
  type UdtDefinitionTagInput,
} from "$lib/sqlite/tables";
import { logger } from "../pino/logger";
import { UdtDefinition, compareTagNames, sortUdtChildren } from "./udt";

function toDefinition(row: typeof tables.udt_definitions.$inferSelect): UdtDefinition {
  return new UdtDefinition({
    id: row.id,
    name: row.name,
    props: row.props ?? {},
    children: sortUdtChildren(row.children ?? []) as unknown as UdtDefinitionTagInput[],
  });
}

export class UdtManager {
  udts = new Map<string, UdtDefinition>();

  constructor() {}

  getAllUdts() {
    return [...this.udts.values()].sort((a, b) => compareTagNames(a.name, b.name));
  }

  getUdt(name: string) {
    return this.udts.get(name);
  }

  getUdtById(id: string) {
    return [...this.udts.values()].find((udt) => udt.id === id);
  }

  async createUdt(input: UdtDefinitionInput, writeToDb = true) {
    const parsed = z_UdtDefinitionInput.safeParse(input);
    if (!parsed.success) {
      return err({
        reason: "UDT_PARSE_ERROR",
        cause: parsed.error.message,
      } as const satisfies NeverThrowError);
    }

    if (this.udts.has(parsed.data.name)) {
      return err({
        reason: "UDT_ALREADY_EXISTS",
        cause: `[UdtManager] createUdt() Udt already exists at ${parsed.data.name}`,
      } as const satisfies NeverThrowError);
    }

    if (writeToDb) {
      const written = attempt(() =>
        db
          .insert(tables.udt_definitions)
          .values({
            id: parsed.data.id,
            name: parsed.data.name,
            props: parsed.data.props,
            children: parsed.data.children,
          })
          .run(),
      );

      if (written.isErr) {
        return err({
          reason: "DB_ERROR",
          cause: errorToString(written.error),
        } as const satisfies NeverThrowError);
      }
    }

    const udt = new UdtDefinition(parsed.data);
    this.udts.set(udt.name, udt);
    logger.info(`[UdtManager] added udt ${udt.name}`);
    return ok(udt);
  }

  async updateUdt(id: string, input: UdtDefinitionInput) {
    const existing = this.getUdtById(id);
    if (!existing) {
      return err({
        reason: "UDT_NOT_FOUND",
        cause: `[UdtManager] updateUdt() no udt at id ${id}`,
      } as const satisfies NeverThrowError);
    }

    const parsed = z_UdtDefinitionInput.safeParse(input);
    if (!parsed.success) {
      return err({
        reason: "UDT_PARSE_ERROR",
        cause: parsed.error.message,
      } as const satisfies NeverThrowError);
    }

    if (parsed.data.id !== id) {
      return err({
        reason: "UDT_ID_MISMATCH",
        cause: `[UdtManager] updateUdt() patch id ${id} does not match value id ${parsed.data.id}`,
      } as const satisfies NeverThrowError);
    }

    const duplicate = this.getUdt(parsed.data.name);
    if (duplicate && duplicate.id !== id) {
      return err({
        reason: "UDT_ALREADY_EXISTS",
        cause: `[UdtManager] updateUdt() Udt already exists at ${parsed.data.name}`,
      } as const satisfies NeverThrowError);
    }

    const written = attempt(() =>
      db.transaction((tx) => {
        tx.update(tables.udt_definitions)
          .set({
            name: parsed.data.name,
            props: parsed.data.props,
            children: parsed.data.children,
          })
          .where(eq(tables.udt_definitions.id, id))
          .run();

        if (existing.name !== parsed.data.name) {
          tx.update(tables.tags)
            .set({ dataType: parsed.data.name })
            .where(eq(tables.tags.dataType, existing.name))
            .run();

          for (const definition of this.udts.values()) {
            if (definition.id === id) continue;
            let changed = false;
            const children = definition.children.map((child) => {
              if (child.dataType !== existing.name) return child;
              changed = true;
              return { ...child, dataType: parsed.data.name };
            });
            if (changed) {
              tx.update(tables.udt_definitions)
                .set({ children })
                .where(eq(tables.udt_definitions.id, definition.id))
                .run();
            }
          }
        }
      }),
    );

    if (written.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(written.error),
      } as const satisfies NeverThrowError);
    }

    this.udts.delete(existing.name);
    const udt = new UdtDefinition(parsed.data);
    this.udts.set(udt.name, udt);

    if (existing.name !== udt.name) {
      for (const definition of this.udts.values()) {
        for (const child of definition.children) {
          if (child.dataType === existing.name) child.dataType = udt.name;
        }
      }
    }

    logger.info(`[UdtManager] updated udt ${udt.name}`);
    return ok({ definition: udt, previousName: existing.name });
  }

  async deleteUdt(id: string) {
    const existing = this.getUdtById(id);
    if (!existing) {
      return err({
        reason: "UDT_NOT_FOUND",
        cause: `[UdtManager] deleteUdt() no udt at id ${id}`,
      } as const satisfies NeverThrowError);
    }

    const written = attempt(() =>
      db.delete(tables.udt_definitions).where(eq(tables.udt_definitions.id, id)).run(),
    );
    if (written.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(written.error),
      } as const satisfies NeverThrowError);
    }

    this.udts.delete(existing.name);
    logger.info(`[UdtManager] deleted udt ${existing.name}`);
    return ok(existing);
  }

  async loadAllFromDb() {
    const definitions = await attempt(() =>
      db.select().from(tables.udt_definitions).orderBy(asc(tables.udt_definitions.name)).all(),
    );
    if (definitions.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(definitions.error),
      } as const satisfies NeverThrowError);
    }

    this.udts.clear();
    for (const row of definitions.data) {
      const udt = toDefinition(row);
      this.udts.set(udt.name, udt);
    }

    logger.debug(`[UdtManager] loaded ${this.udts.size} udts from db`);
    return ok(undefined);
  }
}
