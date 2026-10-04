import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { tags } from "./tags";
import { createInsertSchema } from "drizzle-zod";

export const tag_trend_options = sqliteTable("tag_trend_options", {
  tagId: text("tagId")
    .notNull()
    .primaryKey()
    .references(() => tags.id, { onDelete: "cascade" }),
  interval: integer("interval").notNull(), // log interval ms
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});
export type TagTrendOptionsSelect = typeof tag_trend_options.$inferSelect;
export type TagTrendOptionsInsert = typeof tag_trend_options.$inferInsert;

export const z_insertTagTrendOptions = createInsertSchema(tag_trend_options, {
  enabled: (s) => s.default(true),
  // guards the trends table against an interval fast enough to flood it
  interval: (s) => s.min(100),
});
