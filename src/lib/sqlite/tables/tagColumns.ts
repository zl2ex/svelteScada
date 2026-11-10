import { integer, text } from "drizzle-orm/sqlite-core";
import { z_TagBindings, type TagBindings } from "../../tagBindings";
import { tagWriteLevels } from "../../permissions/constants";

export function tagColumns() {
  return {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    dataType: text("dataType").notNull(),
    type: text("type", { enum: ["tag", "udtTag"] })
      .notNull()
      .default("tag"),
    initalValue: text("intialValue"),
    nodeId: text("nodeId"),
    writeable: integer("writeable", { mode: "boolean" }).default(true),
    exposeOverOpcua: integer("exposeOverOpcua", { mode: "boolean" }).default(true),
    parameters: text("parameters", { mode: "json" }),
    unit: text("unit").notNull().default(""),
    bindings: text("bindings", { mode: "json" }).$type<TagBindings>(),
    writeLevel: text("writeLevel", { enum: tagWriteLevels }).notNull().default("operator"),
    trendEnabled: integer("trend_enabled", { mode: "boolean" }).notNull().default(false),
    trendMinimumSamplingIntervalMs: integer("trend_minimumSamplingIntervalMs")
      .notNull()
      .default(1000),
  };
}
