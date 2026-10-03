import { sql } from "drizzle-orm";

/**
 * The values an enum column accepts, in one list, so the drizzle enum, the zod
 * schema and the SQL CHECK constraint cannot drift apart.
 */
export const endianNames = ["BigEndian", "LittleEndian"] as const;

/**
 * A quoted, comma separated list for a CHECK constraint, which cannot take
 * bound parameters. Only ever called with the literals declared above.
 */
export const sqlEnumList = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(", "));
