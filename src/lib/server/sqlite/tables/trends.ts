import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { tags } from "./tags";
import { createInsertSchema } from "drizzle-zod";

// wip disable row id
export const trends = sqliteTable(
  "trends",
  {
    timestamp: integer("timestamp").notNull(), // unix epoch 64Bit
    tagId: text("tagId")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    statusCode: integer("statusCode").notNull(), // value status code from opcua StatusCodes
  },
  (table) => [primaryKey({ name: "trends_pk", columns: [table.tagId, table.timestamp] })],
);

export type TrendSelect = typeof trends.$inferSelect;
export type TrendInsert = typeof trends.$inferInsert;

export const z_insertTrend = createInsertSchema(trends, {
  timestamp: (s) => s.default(Date.now()),
});
