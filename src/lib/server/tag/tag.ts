import { publishTagValue } from "../../../live/tags";
import { logger } from "$lib/server/pino/logger";
import {
  OPCUAServer,
  type UAVariable,
  DataType,
  Variant,
  StatusCodes,
  VariantArrayType,
  type DateTime,
  type Guid,
  type Double,
  type SByte,
  type Byte,
  type Int16,
  type UInt16,
  type Int32,
  type UInt32,
  type Int64,
  type UInt64,
  type Float,
  type ByteString,
  resolveNodeId,
  NodeId,
  DataValue,
  StatusCode,
} from "node-opcua";
import z from "zod";
import { OpcuaFolder } from "$lib/server/tag/opcuaFolder";
import { deviceManager, gatewayOpcua, udtManager } from "../../../hooks.server";
import { z_insertTag } from "$lib/server/sqlite/tables";
import { err, ok, type Result } from "neverthrow";
import type { NeverThrowError } from "$lib/util/neverThrow";
import { baseTypeKeys, Z_BaseTypes } from "$lib/validation/zod";
import { tryCatch } from "$lib/util/tryCatch";
import type { DriverVariable } from "$lib/server/drivers/driver";

export type TagOptionsInput = z.input<typeof z_insertTag>;

export async function getAllDataTypeStrings() {
  const udtNames = udtManager.getAllUdts().map((udt) => {
    return udt.name;
  });
  return [...baseTypeKeys, ...udtNames];
}

type OpcuaDataTypeMapping = {
  Null: null;
  Boolean: boolean;
  SByte: SByte;
  Byte: Byte;
  Int16: Int16;
  UInt16: UInt16;
  Int32: Int32;
  UInt32: UInt32;
  Int64: Int64;
  UInt64: UInt64;
  Float: Float;
  Double: Double;
  String: string;
  DateTime: DateTime;
  Guid: Guid;
  ByteString: ByteString;
  XmlElement: number;
  NodeId: number;
  ExpandedNodeId: number;
  StatusCode: number;
  QualifiedName: number;
  LocalizedText: number;
  ExtensionObject: object;
  DataValue: number;
  Variant: Variant;
  DiagnosticInfo: number;
  // Add more user-defined types as needed
};

// TypeScript mapping inferred from Zod
export type BaseTypeMap = {
  [K in keyof typeof Z_BaseTypes]: z.infer<(typeof Z_BaseTypes)[K]>;
};

// just the base types
export type BaseTypeStrings = keyof BaseTypeMap;

// base type or array of base type
export type BaseTypeStringsWithArrays =
  | keyof BaseTypeMap
  | `${keyof BaseTypeMap}[]`
  | `${keyof BaseTypeMap}[${number}]`
  | (string & {});

// Runtime mapping of base dataType -> "string" | "number" | "boolean"
type PrimitiveKind<S> =
  S extends z.ZodDefault<infer Inner>
    ? PrimitiveKind<Inner>
    : S extends z.ZodNumber
      ? "number"
      : S extends z.ZodString
        ? "string"
        : S extends z.ZodBoolean
          ? "boolean"
          : never;

const primitiveKind = (schema: z.ZodType): "number" | "string" | "boolean" => {
  let def = schema.def;
  while (def.type === "default" || def.type === "prefault") {
    def = (def as unknown as { innerType: z.ZodType }).innerType.def;
  }
  switch (def.type) {
    case "number":
      return "number";
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    default:
      throw new TypeError(
        `[baseTypeMap] unsupported zod schema kind: ${def.type}`,
      );
  }
};

export const baseTypeMap: {
  [K in keyof typeof Z_BaseTypes]: PrimitiveKind<(typeof Z_BaseTypes)[K]>;
} = Object.fromEntries(
  Object.entries(Z_BaseTypes).map(([key, schema]) => [
    key,
    primitiveKind(schema),
  ]),
) as {
  [K in keyof typeof Z_BaseTypes]: PrimitiveKind<(typeof Z_BaseTypes)[K]>;
};

export type TagValue =
  string | number | boolean | Array<string | number | boolean>;

export function getSchema<DataType extends string>(dataType: DataType) {
  const parsed = dataType.match(/^(?<base>[A-Za-z0-9]+)(?:\[(?<len>\d*?)\])?$/);
  if (!parsed?.groups) {
    return err({
      reason: "INVALID_DATATYPE_STRING",
      cause: `Invalid dataType: ${dataType}`,
    } as const);
  }

  const base = String(parsed.groups.base);
  const len = parsed.groups.len;

  const baseSchema = Z_BaseTypes[base as keyof typeof Z_BaseTypes];
  if (!baseSchema)
    return err({
      reason: "UNKOWN_BASE_DATATYPE",
      cause: `[Tag] Unknown base type: ${base}`,
    } as const);

  if (len === undefined) return ok(baseSchema); // scalar
  if (len === "") return ok(z.array(baseSchema)); // dynamic array
  return ok(z.array(baseSchema).length(Number(len))); // fixed-length tuple
}

export type ResolvedDriverPath = {
  deviceName: string | undefined;
  driverPath: string | undefined;
};

export function resolveOpcuaPath(path: string): ResolvedDriverPath {
  // If identifier is a string path, split into parts
  let deviceName: string | undefined;
  let tagPath: string | undefined;

  // extract device and tagPath from a string like [device]/tagPath
  const match = path.match(/\[(.*?)\](.*)/);
  if (match) {
    deviceName = match[1]; // "device"
    tagPath = match[2]; // "tagPath"
  }

  return {
    deviceName,
    driverPath: tagPath,
  };
}

export type StatusCodeName = Exclude<keyof typeof StatusCodes, "prototype">;

// the client-facing representation of a healthy tag
export type ClientTagValue = Pick<Tag, "id" | "name" | "value" | "options"> & {
  statusString: StatusCodeName;
};

// a tag that failed to load or be created - the map stores the neverthrow
// error `Tag.create` returned alongside the options that caused it, so the
// front end can show the error and let the user change the options to retry
export type FailedTag = NeverThrowError & {
  options: TagOptionsInput;
};

export class Tag {
  id: string;
  name: string;
  opcuaServer: OPCUAServer;
  opcuaFolder: OpcuaFolder;
  options: TagOptionsInput;
  opcuaDataType: DataType = DataType.Null; // TD WIP Datatype check
  isArray: boolean = false;
  arrayLength: number = 0;
  value: TagValue;
  statusCode: StatusCode = StatusCodes.UncertainConfigurationError;
  schema:
    | z.ZodObject
    | z.ZodDefault<z.ZodNumber>
    | z.ZodDefault<z.ZodString>
    | z.ZodDefault<z.ZodBoolean>
    | z.ZodDefault<z.ZodObject>
    | z.ZodArray<
        | z.ZodDefault<z.ZodNumber>
        | z.ZodDefault<z.ZodString>
        | z.ZodDefault<z.ZodBoolean>
        | z.ZodDefault<z.ZodObject>
      >
    | undefined;
  //exposeOverOpcua: boolean = false;
  childTags: Map<string, Tag>; // array of chaildren tags that make up a udt, undeinfed if it is a base tag
  exposeOpcuaVarible?: UAVariable; // varible used to expose over opcua if exposeOverOpcua is true
  driverVarible?: DriverVariable<TagValue>; // driver subscription varible
  driverUnsubscribe?: () => void; // driver cleanup function
  private disposed = false; // disposed flag

  private constructor(
    opcuaServer: OPCUAServer,
    opcuaFolder: OpcuaFolder,
    options: TagOptionsInput,
  ) {
    this.id = options.id;
    this.name = options.name;
    this.opcuaServer = opcuaServer;
    this.opcuaFolder = opcuaFolder;
    this.options = options;
    this.childTags = new Map();
  }

  /**
   * Validate the tag options and construct a `Tag` instance.
   *
   * A `Tag` may only exist when its configuration is correct. Any validation
   * failure returns a reason-tagged error rather than producing a
   * partially-built tag.
   */
  static create(
    opcuaServer: OPCUAServer,
    opcuaFolder: OpcuaFolder,
    opts: TagOptionsInput,
  ): Result<Tag, FailedTag> {
    // parse for any errors but also to get default values
    const parsed = z_insertTag.safeParse(opts);
    if (!parsed.success) {
      return err({
        reason: "OPTIONS_PARSE_ERROR",
        cause: parsed.error.message,
        options: opts,
      } as const);
    }

    const options = parsed.data;

    const tag = new Tag(opcuaServer, opcuaFolder, options);

    // pull out the base datatype and the array size if an array is defined
    // eg input Double[2]  =>   ["Double[2], "Double", 2]
    const arrayMatch = options.dataType.match(/^(\w+)\[(\d*)\]$/);
    tag.isArray = !!arrayMatch || options.dataType.endsWith("[]"); // handles arrays of an unkown size
    tag.arrayLength = arrayMatch ? parseInt(arrayMatch[2], 10) : 0;

    // type without array size or brackets
    const baseDataType = arrayMatch
      ? arrayMatch[1]
      : options.dataType.replace("[]", "");

    const dataType = Object.entries(DataType);
    // is a opcua primative datatype
    if (baseDataType in DataType) {
      tag.opcuaDataType = dataType.find(([key]) => {
        return key == baseDataType;
      })?.[1] as unknown as DataType;

      const schema = getSchema(options.dataType);

      if (schema.isErr()) {
        logger.error(schema.error);
        return err({ ...schema.error, options } as const);
      }

      tag.schema = schema.value;
    }

    // is a user defined datatype and therfore a opcua ExtentionObject
    else {
      options.type = "udtTag";
      tag.opcuaDataType = DataType.ExtensionObject;
      const udtDefinition = udtManager.udts.get(options.dataType);
      if (!udtDefinition) {
        logger.error(
          `[Tag] error while creating tag ${tag.id} dataType ${options.dataType} does not exist in udtDefinitions`,
        );
        return err({
          reason: "UDT_NOT_FOUND",
          cause: `[Tag] error while creating tag ${tag.id} ${tag.name} dataType ${options.dataType} does not exist in udtDefinitions`,
          options,
        } as const);
      }

      for (const tagOptions of udtDefinition
        .buildTagFeilds(options, options.children)
        .values()) {
        const childResult = Tag.create(
          tag.opcuaServer,
          tag.opcuaFolder,
          tagOptions,
        );
        if (childResult.isErr()) return err(childResult.error);
        tag.childTags.set(childResult.value.name, childResult.value);
      }

      tag.schema = z.object();
      for (const [key, childTag] of tag.childTags.entries()) {
        tag.schema = tag.schema.extend({ [key]: childTag.schema });
      }
    }

    if (options.initalValue) {
      let parsed = tag.stringToTagValue(options.initalValue);
      const validated = tag.validate(parsed);

      if (validated.isOk()) {
        tag.value = validated.value;
      }
    }
    // failed to parse initalValue or it was not provided
    if (!tag.value) {
      // get intial value defaults from schema
      const result = tag.schema.safeParse(undefined);

      if (!result.success) {
        logger.error(result.error);
        return err({
          reason: "INVALID_DEFAULTS",
          cause: result.error.message,
          options,
        } as const);
      }

      if (tag.isArray) {
        tag.value = Array(tag.arrayLength).fill(result.data);
      } else {
        tag.value = result.data;
      }
    }

    if (options.exposeOverOpcua) {
      if (!tag.opcuaServer?.engine.addressSpace) {
        throw new Error(
          `[Tag] create() id: ${tag.id} cannot initalise exposeOpcuaVariable as no opcuaServer provided`,
        );
      }
      try {
        const namespace = tag.opcuaServer.engine.addressSpace.getOwnNamespace();
        const parent = tag.opcuaFolder.uaObject;

        // delete varible from
        const node = parent.getComponentByName(tag.id);
        if (node) namespace.deleteNode(node.nodeId);

        tag.exposeOpcuaVarible = namespace.addVariable({
          componentOf: parent,
          browseName: tag.id,
          displayName: tag.name,
          dataType: tag.opcuaDataType,
          valueRank: tag.arrayLength ? 1 : 0,
          arrayDimensions: tag.arrayLength ? [tag.arrayLength] : null,
          minimumSamplingInterval: 500,
          value: {
            get: () =>
              new Variant({
                dataType: tag.opcuaDataType,
                arrayType: tag.isArray ? VariantArrayType.Array : undefined,
                value: tag.value,
              }),
            set: async (variant: Variant) => {
              const update = await tag.update(
                variant.value,
                StatusCodes.Good,
                false, // dont write back to gatewayOpcua
              );

              return tag.statusCode;
            },
          },
        });
      } catch (e) {
        return err({
          reason: "EXPOSE_OPCUA_VARIABLE_FAILED",
          cause: (e as Error).message,
          options,
        } as const);
      }
    }

    // subscribe to value from driver if nodeId provided
    if (options.nodeId) {
      const driverSub = tag.subscribeToDriver();
      if (driverSub.isErr()) {
        logger.error(driverSub.error);
        return err({
          reason: "DRIVER_CONFIG_ERROR",
          cause: driverSub.error,
          options,
        } as const);
      }
      tag.driverVarible = driverSub.value;
    }

    // update tag value when created if it is there, if not set to inital value
    tag.update(
      tag.value,
      StatusCodes.Good,
      true, // do write to gatewayOpcua
      false, // dont write to driver
    );

    /*
    if (initialUpdate.isErr()) {
      logger.error(initialUpdate.error);
      return err({
        reason: "INVALID_INITIAL_VALUE",
        cause: initialUpdate.error,
        options,
      } as const);
    }*/

    logger.debug(`[Tag] created new tag ${tag.id}  ${tag.name} = ${tag.value}`);

    return ok(tag);
  }

  // parse intialValue string stored in database into one of the required datatypes
  private stringToTagValue(value: string): TagValue {
    // Handle arrays stored in json format
    const parsed = tryCatch(() => JSON.parse(value));
    if (parsed.value) {
      return parsed.value;
    }
    // Handle booleans
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;

    // Handle numbers
    if (!isNaN(Number(value)) && value.trim() !== "") {
      return Number(value);
    }

    // Fallback to plain string
    return value;
  }

  private validate(value: unknown) {
    if (!this.schema)
      return err({
        reason: "SCHEMA_UNDEFINED",
        cause: `[Tag] validate() schema undefined for tag ${this.id} ${this.name}`,
        options: this.options,
      } as const);
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      return err({
        reason: "ZOD_PARSE_ERROR",
        cause: parsed.error.message,
        options: this.options,
      } as const);
    }
    return ok(parsed.data);
  }

  getClientValueTag(): ClientTagValue {
    return {
      id: this.id,
      name: this.name,
      value: this.value,
      statusString: this.statusCode.name as StatusCodeName,
      options: this.options,
    };
  }

  subscribeToDriver() {
    if (!this.options.nodeId)
      return err({
        reason: "NODE_ID_UNDEFINED",
        cause: `no nodeId provided for tag ${this.id}  ${this.name}`,
      } as const);

    const resolvedPath = resolveOpcuaPath(this.options.nodeId);
    if (!resolvedPath.deviceName) {
      return err({
        reason: "RESOLVE_DEVICE_NAME_FAILED",
        cause: `[Tag] Device at ${this.options.nodeId} not found while trying to subscribe to driver tag ${this.id} ${this.name}`,
      } as const);
    }

    if (!resolvedPath.driverPath) {
      return err({
        reason: "RESOLVE_DEVICE_DRIVER_PATH_FAILED",
        cause: `[Tag] Driver Path at ${this.options.nodeId} not found while trying to subscribe to driver tag ${this.id} ${this.name}`,
      } as const);
    }

    const device = deviceManager.getDeviceFromPath(resolvedPath.deviceName);
    if (device.isErr()) return err(device.error);
    const variableResult = device.value.subscribe(
      resolvedPath.driverPath,
      this.options.dataType,
    );
    if (variableResult.isErr()) return err(variableResult.error);
    const driverVariable = variableResult.value;

    // driver values subscription
    this.driverUnsubscribe = driverVariable.onChange(
      async ({ value, status }) => {
        await this.update(
          value,
          status,
          true, // do write to gatewayOpcua
          false, // dont write back to driver
        );
      },
    );

    return ok(driverVariable);
  }

  // external write api from web client
  async write(value: TagValue) {
    if (this.options.writeable == false) {
      this.statusCode = StatusCodes.BadNotWritable;
      return err({
        reason: "NOT_WRITEABLE",
        cause: `[Tag] update() ${this.id} failed because writeable is set to false`,
        options: this.options,
      } as const);
    }

    return await this.update(value);
  }

  private async update(
    value: TagValue,
    statusCode: StatusCode = StatusCodes.Good,
    opcuaWrite: boolean = true,
    driverWrite: boolean = true,
  ) {
    const validated = this.validate(value);
    if (validated.isErr()) {
      this.statusCode = StatusCodes.BadTypeMismatch;
      return err(validated.error);
    }
    const newValue = validated.value;
    if (this.isArray !== Array.isArray(newValue))
      throw new TypeError(
        `[Tag] update() Array Type Error - Value ${newValue} is not assignable to tag ${this.id} expected type ${this.options.dataType}`,
      );
    if (
      this.isArray &&
      Array.isArray(newValue) &&
      this.arrayLength !== newValue?.length
    )
      throw new TypeError(
        `[Tag] update() Array Size Error - Value ${newValue} is not assignable to tag ${this.id} expected type ${this.options.dataType}  - provided length ${newValue.length} expected length ${this.arrayLength}`,
      );
    //if(typeof newValue !== typeof this.dataType) throw new Error("Value " + newValue + " is not assignable to tag " + this.nodeId  + " expected type " + this.dataType);

    if (this.driverVarible && driverWrite) {
      const write = await this.driverVarible.write(newValue);
      if (write.isErr()) {
        return err({
          reason: "DRIVER_WRITE_FAILED",
          cause: write.error.reason,
          options: this.options,
        } as const);
      }
    }

    if (this.options.exposeOverOpcua && opcuaWrite) {
      if (!this.exposeOpcuaVarible) {
        throw new Error(
          `[Tag] update() id: ${this.id} cannot update exposeOpcuaVariable as it is not initalised`,
        );
      }
      try {
        this.exposeOpcuaVarible.setValueFromSource(
          {
            dataType: this.opcuaDataType,
            arrayType: this.isArray ? VariantArrayType.Array : undefined,
            dimensions:
              this.isArray && this.arrayLength ? [this.arrayLength] : undefined,
            value: newValue,
          },
          this.statusCode,
        );
      } catch (e) {
        return err({
          reason: "OPCUA_WRITE_FAILED",
          cause: (e as Error).message,
          options: this.options,
        } as const);
      }
    }

    this.value = newValue;
    this.statusCode = statusCode;

    logger.trace(
      `[Tag] update() ${this.id} = ${value} : ${this.statusCode.name}`,
    );

    // notify frontend of updates
    publishTagValue(ok(this.getClientValueTag()));
    return ok(this.statusCode);
  }

  [Symbol.dispose]() {
    this.dispose();
  }

  dispose() {
    logger.trace(`[Tag] dispose() ${this.id}`);
    if (this.disposed) return;
    this.disposed = true;
    try {
      // driver cleanup
      this.driverUnsubscribe?.();
      this.driverVarible?.release();

      if (this.exposeOpcuaVarible) {
        if (!this.opcuaServer.engine.addressSpace) {
          throw new Error(
            `[Tag] dispose() this.opcuaServer.engine.addressSpace undefined`,
          );
        }
        gatewayOpcua.deleteOpcuaVariable(
          this.opcuaServer.engine.addressSpace,
          this.exposeOpcuaVarible,
        );
        this.exposeOpcuaVarible = undefined;
      }

      this.childTags.forEach((child) => {
        child.dispose();
      });
    } catch (error) {
      logger.error(error);
    }
  }
}
