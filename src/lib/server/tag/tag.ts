import { publishTagValue } from "../../../live/tags";
import { logger } from "../pino/logger";
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
import z, { ZodObject } from "zod";
import { OpcuaFolder } from "./opcuaFolder";
import { attempt } from "../../../lib/util/attempt";
import { baseTypeKeys, Z_BaseTypes } from "../../client/tag/zodSchema";
import { deviceManager, gatewayOpcua, udtManager } from "../../../hooks.server";
import { z_insertTag } from "../sqlite/tables";
import { err, ok, type Result } from "neverthrow";

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

// Parse "Double[3]" or "SensorUDT[]" into base + length
type ParseArray<DataTypeString extends string> =
  DataTypeString extends `${infer Base}[${infer Len}]`
    ? Len extends `${number}`
      ? { base: Base; length: Len }
      : { base: Base; length: "dynamic" }
    : { base: DataTypeString; length: null };

// Build fixed-length tuple
type BuildTuple<
  T,
  N extends number,
  R extends unknown[] = [],
> = R["length"] extends N ? R : BuildTuple<T, N, [...R, T]>;

export type ResolveType<DataType extends string> =
  ParseArray<DataType> extends { base: infer B; length: infer L }
    ? B extends keyof BaseTypeMap
      ? L extends "dynamic"
        ? BaseTypeMap[B][] // dynamic array
        : L extends `${infer N extends number}`
          ? BuildTuple<BaseTypeMap[B], N> // fixed-length tuple
          : BaseTypeMap[B] // scalar
      : never
    : never;

export function getSchema<DataType extends string>(dataType: DataType) {
  const parsed = dataType.match(/^(?<base>[A-Za-z0-9]+)(?:\[(?<len>\d*?)\])?$/);
  if (!parsed?.groups) throw new Error(`Invalid dataType: ${dataType}`);

  const base = String(parsed.groups.base);
  const len = parsed.groups.len;

  const baseSchema = Z_BaseTypes[base as keyof typeof Z_BaseTypes];
  if (!baseSchema) throw new Error(`[Tag] Unknown base type: ${base}`);

  if (len === undefined) return baseSchema; // scalar
  if (len === "") return z.array(baseSchema); // dynamic array
  return z.array(baseSchema).length(Number(len)); // fixed-length tuple
}

export type ResolvedOpcuaPath = {
  nodeId: NodeId;
  deviceName: string | undefined;
  tagPath: string | undefined;
};

export function resolveOpcuaPath(path: string): ResolvedOpcuaPath {
  // Parse NodeId into parts
  const nodeId = resolveNodeId(path);
  const identifier = nodeId.value as string;

  // If identifier is a string path, split into parts
  let deviceName: string | undefined;
  let tagPath: string | undefined;

  // extract device and tagPath from a string like [device]/tagPath
  const match = identifier.match(/\[(.*?)\](.*)/);
  if (match) {
    deviceName = match[1]; // "device"
    tagPath = match[2]; // "tagPath"
  }

  return {
    nodeId,
    deviceName,
    tagPath,
  };
}

export type StatusCodeName = Exclude<keyof typeof StatusCodes, "prototype">;

// the client-facing representation of a healthy tag
export type ClientTagValue = Pick<
  Tag<any>,
  "id" | "name" | "value" | "options"
> & {
  statusString: StatusCodeName;
};

export type NeverthrowError = {
  reason: string;
  cause: unknown;
};

type TagUpdateError =
  | {
      reason: "NOT_WRITEABLE";
      cause: string;
      options: TagOptionsInput;
    }
  | {
      reason: "DRIVER_OPCUA_WRITE_FAILED";
      cause: unknown;
      options: TagOptionsInput;
    }
  | {
      reason: "OPCUA_WRITE_FAILED";
      cause: unknown;
      options: TagOptionsInput;
    };

export type TagError =
  | {
      reason: "OPTIONS_PARSE_ERROR";
      cause: z.ZodError;
      options: TagOptionsInput;
    }
  | { reason: "SCHEMA_ERROR"; cause: unknown; options: TagOptionsInput }
  | { reason: "UDT_NOT_FOUND"; cause: string; options: TagOptionsInput }
  | {
      reason: "DRIVER_SUBSCRIBE_ERROR";
      cause: unknown;
      options: TagOptionsInput;
    }
  | {
      reason: "EXPOSE_OPCUA_VARIABLE_FAILED";
      cause: unknown;
      options: TagOptionsInput;
    }
  | {
      reason: "INVALID_INITIAL_VALUE";
      cause: TagUpdateError;
      options: TagOptionsInput;
    }
  | { reason: "INVALID_DEFAULTS"; cause: unknown; options: TagOptionsInput };

// a tag that failed to load or be created - the map stores the neverthrow
// error `Tag.create` returned alongside the options that caused it, so the
// front end can show the error and let the user change the options to retry
export type FailedTag = TagError & {
  options?: TagOptionsInput;
};

export class Tag<DataTypeString extends BaseTypeStringsWithArrays> {
  id: string;
  name: string;
  opcuaServer: OPCUAServer;
  opcuaFolder: OpcuaFolder;
  options: TagOptionsInput;

  //nodeId?: string; // opcua node path that the tag references to get its value from a driver ect
  //dataType?: DataTypeString;
  opcuaDataType: DataType = DataType.Null; // TD WIP Datatype check
  isArray: boolean = false;
  arrayLength: number = 0;
  //writeable: boolean = false;
  //@ts-ignore
  value: ResolveType<DataTypeString> = 0;
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
  childTags: Map<string, Tag<any>>; // array of chaildren tags that make up a udt, undeinfed if it is a base tag
  exposeOpcuaVarible?: UAVariable; // varible used to expose over opcua if exposeOverOpcua is true
  driverOpcuaVarible?: UAVariable; // varible that nodeId points at
  private disposed = false; // disposed flag
  //parameters?: UdtParams; // parameters for building udt path's ect

  /* static initOpcuaServer(server: OPCUAServer) {
    this.opcuaServer = server;
    Tag.tagFolder = this.opcuaServer.engine.addressSpace
      ?.getOwnNamespace()
      .addObject({
        organizedBy: this.opcuaServer
  .engine.addressSpace?.rootFolder.objects,
        browseName: "Tags",
      });
  }*/

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
  static create<
    U extends BaseTypeStringsWithArrays = BaseTypeStringsWithArrays,
  >(
    opcuaServer: OPCUAServer,
    opcuaFolder: OpcuaFolder,
    options: TagOptionsInput,
  ): Result<Tag<U>, TagError> {
    // parse for any errors but also to get default values
    const parsed = z_insertTag.safeParse(options);
    if (!parsed.success) {
      console.debug("error parsing");
      console.error(parsed.error);
      return err({
        reason: "OPTIONS_PARSE_ERROR",
        cause: parsed.error,
        options,
      } as const);
    }

    options = parsed.data;

    const tag = new Tag<U>(opcuaServer, opcuaFolder, options);

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

      const result = attempt(() => getSchema(options.dataType));

      if ("error" in result) {
        logger.error(result.error);
        return err({
          reason: "SCHEMA_ERROR",
          cause: result.error,
          options,
        } as const);
      }

      tag.schema = result.data;
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
          cause: `no user defined dataType ${options.dataType}`,
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

    // subscribe to value from driver if nodeId provided
    if (options.nodeId) {
      const opcuaVarible = attempt(() => tag.subscribeToDriver());
      if ("error" in opcuaVarible) {
        logger.error(opcuaVarible.error);
        return err({
          reason: "DRIVER_SUBSCRIBE_ERROR",
          cause: opcuaVarible.error,
          options,
        } as const);
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
                value:
                  tag.opcuaDataType === DataType.Boolean
                    ? Boolean(tag.value)
                    : tag.value,
              }),
            set: (variant: Variant) => {
              const update = tag.update(variant.value, StatusCodes.Good, false);
              //if (update.isErr()) return tag.statusCode;
              publishTagValue(ok(tag.getClientValueTag()));
              return tag.statusCode;
            },
          },
        });
      } catch (e) {
        return err({
          reason: "EXPOSE_OPCUA_VARIABLE_FAILED",
          cause: e,
          options: tag.options,
        } as const);
      }
    }

    // TD WIP DataType
    let initalValue: any;

    if (options.value) {
      const validated = tag.validate(options.value);
      if (validated.isErr()) {
        logger.error(validated.error);
        return err({
          reason: "INVALID_INITIAL_VALUE",
          cause: validated.error,
          options,
        } as const);
      }
      initalValue = validated.value;
    } else {
      let getDefaults = undefined;
      if (tag.schema instanceof ZodObject) getDefaults = {};
      // get intial value defaults from schema
      const result = tag.schema?.safeParse(getDefaults);

      if (!result.success) {
        logger.error(result.error);
        return err({
          reason: "INVALID_DEFAULTS",
          cause: result.error,
          options,
        } as const);
      }
      initalValue = result.data;

      if (tag.isArray) {
        initalValue = Array(tag.arrayLength).fill(initalValue);
      }
    }

    // update tag value when created if it is there, if not set to inital value
    const initialUpdate = tag.update(
      tag.driverOpcuaVarible?.readValue().value.value ?? initalValue,
      StatusCodes.UncertainInitialValue,
    );

    if (initialUpdate.isErr()) {
      logger.error(initialUpdate.error);
      return err({
        reason: "INVALID_INITIAL_VALUE",
        cause: initialUpdate.error,
        options,
      } as const);
    }

    // notify frontend of updates
    publishTagValue(ok(tag.getClientValueTag()));

    logger.debug(`[Tag] created new tag ${tag.id}  ${tag.name} = ${tag.value}`);

    return ok(tag);
  }

  private validate(value: unknown) {
    if (!this.schema)
      return err({
        reason: "SCHEMA_UNDEFINED",
        options: this.options,
      } as const);
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      return err({
        reason: "ZOD_PARSE_ERROR",
        cause: parsed.error,
        options: this.options,
      } as const);
    }
    return ok(parsed.data);
  }

  private opcuaValueChanged(newValue: DataValue) {
    if (
      newValue.value.value == this.value &&
      newValue.statusCode == this.statusCode
    ) {
      return; // if the tag class called update() already so we have the current value and status code
    }

    if ((newValue.value.dataType as DataType) !== this.opcuaDataType) {
      logger.error(
        `[Tag] opcuaValueChanged() data type ${newValue.value.dataType}  not assignable to ${this.opcuaDataType}`,
      );
      return;
    }

    logger.trace(
      `[Tag] opcuaValueChanged() for ${this.id} = ${newValue.value.value} ${newValue.statusCode.toString()}`,
    );
    const validated = this.validate(newValue.value.value);
    if (validated.isErr()) {
      logger.error(validated.error.reason);
      return;
    }
    this.value = validated.value;
    this.statusCode = newValue.statusCode;
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
    if (!this.options.nodeId) return;

    const resolvedPath = resolveOpcuaPath(this.options.nodeId);
    if (!resolvedPath.deviceName) {
      throw new Error(
        `[Tag] Device at ${this.options.nodeId} not found while trying to create tag ${this.id}`,
      );
    }

    const device = deviceManager.getDeviceFromPath(resolvedPath.deviceName);

    const variable = device.tagSubscribed(this);

    if (!variable)
      throw new Error(
        `[Tag] failed to subscribe to tag at ${this.options.nodeId} while trying to create tag ${this.id}`,
      );
    /*
    const addressSpace = server.engine.addressSpace;
    if (!addressSpace)
      throw new Error("[Tag] Internal OPCUA AddressSpace not ready");

    // browse path to find node
    const browseResult = addressSpace.browsePath(
      makeBrowsePath(addressSpace.rootFolder, path)
    );
    logger.debug(browseResult);
    if (!browseResult.targets || browseResult.targets.length === 0) {
      throw new Error(`[Tag] OPCUA Path not found: ${path}`);
    }

    const nodeId = browseResult.targets[0].targetId;
    const variable = addressSpace.findNode(nodeId) as UAVariable;
    if (!variable) throw new Error(`[Tag] Variable not found for path ${path}`);
*/
    // listen to value changes
    variable.on("value_changed", this.opcuaValueChanged);

    this.driverOpcuaVarible = variable;
  }

  unsubscribeToDriver() {
    if (!this.options.nodeId) return;
    const resolvedPath = resolveOpcuaPath(this.options.nodeId);
    if (!resolvedPath.deviceName) {
      logger.error(
        `[Tag] Device at ${this.options.nodeId} not found while trying to unsubscribe from tag ${this.id}`,
      );
      return;
    }

    this.driverOpcuaVarible?.removeListener(
      "value_changed",
      this.opcuaValueChanged,
    );
    this.driverOpcuaVarible = undefined;
    const device = deviceManager.getDeviceFromPath(resolvedPath.deviceName);
    device.tagUnsubscribed(this);
  }

  update(
    value: ResolveType<DataTypeString>,
    statusCode = StatusCodes.Good,
    opcuaWrite: boolean = true,
  ) {
    if (this.options.writeable == false) {
      this.statusCode = StatusCodes.BadNotWritable;
      return err({
        reason: "NOT_WRITEABLE",
        cause: `[Tag] update() ${this.id} failed because writeable is set to false`,
        options: this.options,
      } as const);
    }

    const validated = this.validate(value);
    if (validated.isErr()) {
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

    if (this.driverOpcuaVarible) {
      try {
        this.driverOpcuaVarible.setValueFromSource(
          {
            dataType: this.opcuaDataType,
            arrayType: this.isArray ? VariantArrayType.Array : undefined,
            dimensions:
              this.isArray && this.arrayLength ? [this.arrayLength] : undefined,
            value: newValue,
          },
          this.statusCode,
        );
      } catch (error) {
        return err({
          reason: "DRIVER_OPCUA_WRITE_FAILED",
          cause: error,
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
      } catch (error) {
        return err({
          reason: "OPCUA_WRITE_FAILED",
          cause: error,
          options: this.options,
        } as const);
      }
    }

    this.value = newValue;
    this.statusCode = statusCode;

    logger.trace(
      `[Tag] update() ${this.id} = ${value} : ${this.statusCode.name}`,
    );

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
      this.unsubscribeToDriver();

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
