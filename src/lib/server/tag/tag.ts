import { logger } from "../../pino/logger";
import {
  OPCUAServer,
  type UAVariable,
  DataType,
  Variant,
  type Namespace,
  StatusCodes,
  type UAObject,
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
  makeBrowsePath,
  resolveNodeId,
  NodeId,
  NodeIdType,
} from "node-opcua";
import { udtDefinitions } from "./udtDefinitions";
import { collections } from "../mongodb/collections";
import { emitToSubscribers, type EmitPayload } from "../socket.io/socket.io";
import { deviceManager } from "../../../server";
import z from "zod";

export type TagOptions = {
  name: string;
  path: TagPaths | (string & {});
  nodeId: string;
  dataType: BaseTypeStrings;
  writable?: boolean;
  initialValue?: any;
  parameters?: object;
  exposeOverOpcua?: boolean;
  onUpdate?: (value: any) => void;
  emit?: (event: string, payload: EmitPayload) => void;
};

export function isTagOptions(options: TagOptions | unknown) {
  return (
    "name" in options &&
    "path" in options &&
    "nodeId" in options &&
    "dataType" in options
  );
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

// Base schemas for primitives and UDTs
export const baseZodSchemas = {
  Double: z.number(),
  Int32: z.number().int(),
  Boolean: z.boolean(),
  String: z.string(),
  SensorUDT: z.object({
    faulted: z.boolean(),
    value: z.number(),
  }),
  // You can add more UDTs here
} as const;

// TypeScript mapping inferred from Zod
export type BaseTypeMap = {
  [K in keyof typeof baseZodSchemas]: z.infer<(typeof baseZodSchemas)[K]>;
};

export type BaseTypeStrings = keyof BaseTypeMap;

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

export function getSchema<DataType extends string>(
  dataType: DataType
): z.ZodTypeAny {
  const parsed = dataType.match(/^(?<base>[A-Za-z]+)(?:\[(?<len>\d*?)\])?$/);
  if (!parsed?.groups) throw new Error(`Invalid dataType: ${dataType}`);

  const base = parsed.groups.base;
  const len = parsed.groups.len;

  const baseSchema = (baseZodSchemas as any)[base];
  if (!baseSchema) throw new Error(`Unknown base type: ${base}`);

  if (len === undefined) return baseSchema; // scalar
  if (len === "") return z.array(baseSchema); // dynamic array
  return z.array(baseSchema).length(Number(len)); // fixed-length tuple
}

function decodeDataType(dataType: string) {
  let opcuaDataType: DataType;
  const arrayMatch = dataType.match(/^(\w+)\[(\d*)\]$/);
  let isArray = !!arrayMatch || dataType.endsWith("[]"); // handles arrays of an unkown size
  let arrayLength = arrayMatch ? parseInt(arrayMatch[2], 10) : undefined;

  // type without array size or brackets
  const baseDataType = arrayMatch ? arrayMatch[1] : dataType.replace("[]", "");
  // is a opcua datatype
  if (Object.values(DataType).includes(baseDataType as unknown as DataType)) {
    opcuaDataType = baseDataType as unknown as DataType;
  }
  // is a user defined datatype and therfore a opcua ExtentionObject
  else {
    opcuaDataType = DataType.ExtensionObject;
  }

  if (isArray == false) {
    return typeof Array.of(0);
  }
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

  // extract device and tagPath from a string like ns=1;s=[device]/tagPath
  const match = identifier.match(/\[(.*?)\]\/([^/]+)/);
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

// TD WIP Make this auto generated from mongodb data
export type TagTypeMapDefinition = {
  "/demo/test": "Double";
  "/testTag": "Double";
};

export type TagTypeMap = {
  [P in keyof TagTypeMapDefinition]: Tag<TagTypeMapDefinition[P]>;
};

export type TagPaths = keyof TagTypeMapDefinition;

export class Tag<DataTypeString extends BaseTypeStrings> {
  static tags: TagTypeMap = Object();
  static opcuaServer: OPCUAServer;
  name: string;
  path: keyof typeof Tag.tags; // path that tags are organised by internally
  nodeId: string; // opcua node path that the tag references
  dataType: DataTypeString;
  opcuaDataType: DataType;
  isArray: boolean;
  arrayLength: number | undefined;
  writable: boolean;
  value: ResolveType<DataTypeString>;
  schema: z.ZodType;
  exposeOverOpcua: boolean;
  variable?: UAVariable;
  onUpdate?: (value: Tag<DataTypeString>) => void;

  constructor(dataType: DataTypeString, opts: Omit<TagOptions, "dataType">) {
    this.name = opts.name;
    this.path = opts.path; // TD WIP
    this.nodeId = opts.nodeId ?? `ns=1;s=${opts.name}`;
    this.dataType = dataType;
    this.schema = getSchema(dataType);

    this.writable = opts.writable ?? false;
    this.exposeOverOpcua = opts.exposeOverOpcua ?? false;

    this.onUpdate = opts.onUpdate;

    // pull out the base datatype and the array size if an array is defined
    // eg input Double[2]  =>   ["Double[2], "Double", 2]
    const arrayMatch = dataType.match(/^(\w+)\[(\d*)\]$/);
    this.isArray = !!arrayMatch || dataType.endsWith("[]"); // handles arrays of an unkown size
    this.arrayLength = arrayMatch ? parseInt(arrayMatch[2], 10) : undefined;

    // type without array size or brackets
    const baseDataType = arrayMatch
      ? arrayMatch[1]
      : dataType.replace("[]", "");
    // is a opcua primative datatype
    if (Object.values(DataType).includes(baseDataType as unknown as DataType)) {
      this.opcuaDataType = baseDataType as unknown as DataType;
    }
    // is a user defined datatype and therfore a opcua ExtentionObject
    else if (Object.hasOwn(udtDefinitions, dataType)) {
      this.opcuaDataType = DataType.ExtensionObject;
      const udtDefinition =
        udtDefinitions[dataType as keyof typeof udtDefinitions];

      for (let [key, tagOptions] of Object.entries(udtDefinition.values)) {
        if (isTagOptions(tagOptions)) {
          Object.assign(tagOptions, {
            parameters: opts.parameters
              ? opts.parameters
              : udtDefinition.parameters,
          });
          for (const [key, value] of Object.entries(tagOptions.value)) {
            console.log(key, value);
          }
          console.log(key, tagOptions);
        }
      }
    } else {
      throw new Error(
        `[Tag] error while creating tag ${this.path} dataType ${opts.dataType} does not exist in udtDefinitions`
      );
    }

    // fill array with values based on length if not provided in inital value
    if (
      this.isArray &&
      this.arrayLength &&
      !Array.isArray(opts?.initialValue)
    ) {
      this.value = Array(this.arrayLength).fill(0);
    }
    // check if the correct length array was supplied in the initalValue
    else if (this.isArray && opts.initialValue?.length == this.arrayLength) {
      this.value = opts.initialValue;
    } else if (opts.initialValue) {
      this.value = opts.initialValue;
    } else {
      throw new Error(
        `[Tag] Inital value Error ${opts.initialValue} was not provided or is the wrong type for tag ${this.path} expected type ${this.dataType}`
      );
    }

    this.subscribeByPath(Tag.opcuaServer, this.nodeId);

    if (this.exposeOverOpcua) {
      const namespace = Tag.opcuaServer.engine.addressSpace!.getOwnNamespace();
      const parent = Tag.opcuaServer.engine.addressSpace?.rootFolder; // TD WIP
      this.variable = namespace.addVariable({
        componentOf: parent,
        browseName: this.name,
        nodeId: this.nodeId,
        dataType: this.opcuaDataType,
        valueRank: this.arrayLength ? 1 : 0,
        arrayDimensions: this.arrayLength ? [this.arrayLength] : null,
        value: {
          get: () =>
            new Variant({
              dataType: this.opcuaDataType,
              arrayType: this.isArray ? VariantArrayType.Array : undefined,
              value: this.value,
            }),
          set: (variant: Variant) => {
            if (this.isArray && variant.value.length !== this.arrayLength) {
              return { statusCode: StatusCodes.BadOutOfRange };
            }
            this.value = variant.value;
            this.triggerEmit();
            return { statusCode: StatusCodes.Good };
          },
        },
      });

      this.variable.on("value_changed", (dataValue) => {
        if (this.isArray) {
          this.value = Array.from(dataValue.value.value);
        } else {
          this.value = dataValue.value.value;
        }
        this.triggerEmit();
      });
    }

    // push instance to tags map referenced by path
    // TD WIP typescript
    Tag.tags[this.path] = this;
  }

  private validate(value: unknown): ResolveType<DataTypeString> {
    return this.schema.parse(value);
  }

  static async loadAllTagsFromDB() {
    // find all tags in the database
    const initTags = collections.tags.find();
    let tagConfig = await initTags.next(); // get next tag from db cursor
    while (tagConfig) {
      if (!isTagOptions(tagConfig))
        throw new Error("[Tag] Error loading tag from DB");

      // Is it a primitive datatype eg Bool or Double
      //if(Object.values(DataType).some(type => String(type).startsWith(value.dataType))) {
      //if(value.dataType.includes(Object.values(DataType)))
      const tag = new Tag(tagConfig.dataType, {
        name: tagConfig.name,
        path: tagConfig.path,
        nodeId: tagConfig.nodeId,
        initialValue: tagConfig.initialValue,
      });

      //tags[value.nodeId as unknown as NodeIdLiteral] = tag;

      /*}
        // is a Udt Datatype defined in udt.json
        else if(Object.keys(jsonUdt).includes(value.dataType)) {
          const udtTag = createUdtTag(name, value);
          udtTag.init(ns, root);
          tags[value.nodeId] = udtTag;
        }
        else {
          logger.debug(Object.values(DataType));
          logger.error("dataType " + value.dataType + " Does not exist in udt.json");
        }*/

      // get the next tag config from the database cursor if there is one
      tagConfig = await initTags.next();
    }
  }

  subscribeByPath(server: OPCUAServer, path: string) {
    const resolvedPath = resolveOpcuaPath(path);
    if (!resolvedPath.deviceName) {
      throw new Error(
        `[Tag] Device at ${path} not found while trying to create tag ${this.path}`
      );
    }

    const device = deviceManager.getDeviceFromPath(resolvedPath.deviceName);

    const variable = device.tagSubscribed(path);

    if (!variable)
      throw new Error(
        `[Tag] failed to subscribe to tag at ${path} while trying to create tag ${this.path}`
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
    variable.on("value_changed", (newValue) => {
      logger.debug(`Value changed for ${path}:`, newValue.value.value);
    });
  }

  update(value: ResolveType<DataTypeString>) {
    const newValue = this.validate(value);

    if (this.isArray !== Array.isArray(newValue))
      throw new TypeError(
        `[Tag] Array Type Error - Value ${newValue} is not assignable to tag ${this.path} expected type ${this.dataType}`
      );
    if (this.isArray && this.arrayLength !== newValue?.length)
      throw new TypeError(
        `Array Size Error - Value ${newValue} is not assignable to tag ${this.path} expected type ${this.dataType}  - provided length ${newValue.length} expected length ${this.arrayLength}`
      );
    //if(typeof newValue !== typeof this.dataType) throw new Error("Value " + newValue + " is not assignable to tag " + this.nodeId  + " expected type " + this.dataType);
    this.value = newValue;
    if (this.exposeOverOpcua) {
      this.variable?.setValueFromSource({
        dataType: this.opcuaDataType,
        arrayType: this.isArray ? VariantArrayType.Array : undefined,
        //dimensions: this.isArray && this.arrayLength ? [this.arrayLength] : undefined,
        value: newValue,
      });
    }
    this.triggerEmit();
  }

  triggerEmit() {
    this.onUpdate?.(this);
    emitToSubscribers({ path: this.path, value: this });
  }
}
