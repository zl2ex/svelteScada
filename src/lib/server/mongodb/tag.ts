import { db } from "./db";
import { type TagOptionsInput } from "../tag/tag";

export const tags = db.collection<TagOptionsInput<any>>("tags");
await tags.createIndex({ path: 1 }, { unique: true });
