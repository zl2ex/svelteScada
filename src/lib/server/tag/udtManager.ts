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
import { normalizeUdtChild } from "./legacyNormalization";

/**
 * Converts a persisted UDT row into an `UdtDefinition`, sorting its children.
 *
 * @param row - Database row to convert.
 * @returns The constructed UDT definition.
 */
function toDefinition(row: typeof tables.udt_definitions.$inferSelect): UdtDefinition {
  return new UdtDefinition({
    id: row.id,
    name: row.name,
    properties: row.properties ?? {},
    children: sortUdtChildren(row.children ?? []) as unknown as UdtDefinitionTagInput[],
  });
}

export class UdtManager {
  udts = new Map<string, UdtDefinition>();

  /**
   * Creates an empty UDT manager.
   */
  constructor() {}

  /**
   * Returns all UDT definitions sorted by name.
   *
   * @returns Sorted array of UDT definitions.
   */
  getAllUdts() {
    return [...this.udts.values()].sort((a, b) => compareTagNames(a.name, b.name));
  }

  /**
   * Looks up a UDT definition by name.
   *
   * @param name - UDT name to look up.
   * @returns The matching definition, or undefined when not loaded.
   */
  getUdt(name: string) {
    return this.udts.get(name);
  }

  /**
   * Looks up a UDT definition by id.
   *
   * @param id - UDT id to look up.
   * @returns The matching definition, or undefined when not loaded.
   */
  getUdtById(id: string) {
    return [...this.udts.values()].find((udt) => udt.id === id);
  }

  /**
   * Applies rewritten child bindings to loaded UDT definitions.
   *
   * @param updates - Map of UDT id to rewritten child definitions.
   * @returns Array of updated UDT definition inputs.
   */
  applyBindingUpdates(updates: Map<string, UdtDefinitionTagInput[]>) {
    const updated: UdtDefinitionInput[] = [];
    for (const [id, children] of updates) {
      const definition = this.getUdtById(id);
      if (!definition) continue;
      definition.children = children;
      updated.push(definition.toInput());
    }
    return updated;
  }

  /**
   * Validates and stores a new UDT definition, optionally persisting it.
   *
   * @param input - UDT definition input to create.
   * @param [writeToDb] - Whether to insert the definition row, defaults to true.
   * @returns Ok with the created definition, or Err when parsing, duplicate check or DB insert
   * fails.
   */
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
            properties: parsed.data.properties,
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

  /**
   * Updates a UDT definition and rewrites references to its old name across tags and definitions.
   *
   * @param id - Id of the UDT to update.
   * @param input - New UDT definition input.
   * @returns Ok with the updated definition and previous name, or Err when lookup, parsing,
   * id/duplicate validation or the DB transaction fails.
   */
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
            properties: parsed.data.properties,
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

  /**
   * Deletes a UDT definition from memory and the database.
   *
   * @param id - Id of the UDT to delete.
   * @returns Ok with the deleted definition, or Err when it is missing or the DB delete fails.
   */
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

  /**
   * Loads all UDT definitions from the database, normalizing legacy child keys.
   *
   * @returns Ok(undefined) when loading completes, or Err when the DB read fails.
   */
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
      let changed = false;
      const children = row.children.map((child) => {
        const normalized = normalizeUdtChild(child);
        if (normalized.changed) changed = true;
        return normalized.value;
      });

      if (changed) {
        const written = attempt(() =>
          db
            .update(tables.udt_definitions)
            .set({ children })
            .where(eq(tables.udt_definitions.id, row.id))
            .run(),
        );
        if (written.isErr) logger.error(written.error);
      }

      const udt = toDefinition({ ...row, children });
      this.udts.set(udt.name, udt);
    }

    logger.debug(`[UdtManager] loaded ${this.udts.size} udts from db`);
    return ok(undefined);
  }
}
