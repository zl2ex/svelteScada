import { type Table, SQL } from "drizzle-orm";

export function getTableDefaults<T extends Table>(table: T) {
  const defaults: Record<string, any> = {};
  for (const [key, value] of Object.entries(table)) {
    if (
      "hasDefault" in (value as any) &&
      (value as any).hasDefault &&
      (value as any).default !== undefined &&
      !((value as any).default instanceof SQL)
    ) {
      defaults[key] = (value as any).default;
    }
  }
  return defaults;
}
