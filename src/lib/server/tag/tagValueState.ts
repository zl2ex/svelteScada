import { StatusCodes } from "node-opcua";
import type { Tag } from "./tag";

export type StatusCodeName = Exclude<keyof typeof StatusCodes, "prototype">;

export type TagValueState = Pick<
  Tag<any>,
  "id" | "name" | "value" | "options"
> & { errorString: string | undefined; statusString: StatusCodeName };
