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

// Base schemas for primitives
export const Z_BaseTypes = {
  Double: z.number(),
  Int16: z.number().int().max(65535),
  Int32: z.number().int().max(4294967295), // TD WIP max and min
  Boolean: z.boolean(),
  String: z.string(),
} as const;

export const Z_TagOptions = z.object({
  name: z.string(),
  path: z.string(), // TD WIP Tighten type ?
  nodeId: z.string(),
  dataType: z.string(), // TD WIP Tighten type ?
  writable: z.boolean().optional().default(true),
  initialValue: z.any().optional(),
  parameters: z.object().optional(),
  exposeOverOpcua: z.boolean().optional().default(false),
  //onUpdate: z.function(),
});

export type TagOptions<T> = z.input<typeof Z_TagOptions>;
/*
export type TagOptions<DataTypeString extends BaseTypeStringsWithArrays> = {
  name: string;
  path: TagPaths; //  | (string & {}); // TD WIP
  nodeId: string;
  dataType: DataTypeString;
  writable?: boolean;
  initialValue?: ResolveType<DataTypeString>;
  parameters?: object;
  exposeOverOpcua?: boolean;
  onUpdate?: (value: any) => void;
};
*/
export function isTagOptions(options: TagOptions<any> | unknown) {
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
  | `${keyof BaseTypeMap}[${number}]`;

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
  const parsed = dataType.match(/^(?<base>[A-Za-z0-9]+)(?:\[(?<len>\d*?)\])?$/);
  if (!parsed?.groups) throw new Error(`Invalid dataType: ${dataType}`);

  const base = parsed.groups.base;
  const len = parsed.groups.len;

  const baseSchema = (Z_BaseTypes as any)[base];
  if (!baseSchema) throw new Error(`[Tag] Unknown base type: ${base}`);

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
  "/demo/testInt32": "Int32";
  "/demo/testInt16": "Int16";
  "/demo/testBool": "Boolean";
};

export type TagTypeMap = {
  [P in keyof TagTypeMapDefinition]: Tag<TagTypeMapDefinition[P]>;
};

export type TagPaths = keyof TagTypeMapDefinition;

export class Tag<DataTypeString extends BaseTypeStringsWithArrays> {
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
  variable?: UAVariable; // varible used to expose over opcua if exposeOverOpcua is true
  opcuaVarible: UAVariable; // varible that nodeId points at
  children: Tag<any>[] | undefined; // array of chaildren tags that make up a udt, undeinfed if it is a base tag
  onUpdate?: (value: Tag<DataTypeString>) => void;

  constructor(
    dataType: DataTypeString,
    opts: Omit<TagOptions<DataTypeString>, "dataType">
  ) {
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
        `[Tag] error while creating tag ${this.path} dataType ${dataType} does not exist in udtDefinitions`
      );
    }

    // no inital value given so generate defaults
    if (!opts.initialValue) {
      if (
        dataType === "Double" ||
        dataType === "Int32" ||
        dataType === "Boolean"
      ) {
        if (this.isArray) {
          this.value = Array<ResolveType<DataTypeString>>(
            this.arrayLength
          ).fill(0);
        } else {
          this.value = 0;
        }
      } else if (dataType === "String") {
        if (this.isArray) {
          this.value = Array<ResolveType<DataTypeString>>(
            this.arrayLength
          ).fill("");
        } else {
          this.value = "";
        }
      }
    } else {
      this.value = this.validate(opts.initialValue);
    }

    this.opcuaVarible = this.subscribeByPath(Tag.opcuaServer, this.nodeId);

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
            /*if (this.isArray && variant.value.length !== this.arrayLength) {
              return { statusCode: StatusCodes.BadOutOfRange };
            }*/
            try {
              this.value = this.validate(variant.value);
              this.triggerEmit();
              return { statusCode: StatusCodes.Good };
            } catch (error) {
              logger.error(
                `[Tag] set value failed with error ${error?.message}`
              );
              return { statusCode: StatusCodes.BadTypeMismatch };
            }
          },
        },
      });

      /*
      this.variable.on("value_changed", (dataValue) => {
        if (this.isArray) {
          this.value = Array.from(dataValue.value.value);
        } else {
          this.value = dataValue.value.value;
        }
        this.triggerEmit();
      });*/
    }

    // push instance to tags map referenced by path
    // TD WIP typescript
    Tag.tags[this.path] = this;

    logger.info(`[Tag] created new tag ${this.path}`);
  }

  // will throw ZodError if it fails
  private validate(value: unknown): ResolveType<DataTypeString> {
    return this.schema.parse(value) as ResolveType<DataTypeString>;
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

      try {
        const tag = new Tag(tagConfig.dataType, {
          name: tagConfig.name,
          path: tagConfig.path,
          nodeId: tagConfig.nodeId,
          initialValue: tagConfig.initialValue,
        });
      } catch (error) {
        logger.error(
          `[Tag] failed to load tag ${tagConfig.path} error ${error?.message}`
        );
      }

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
      console.log(`Value changed for ${path}:`);
      console.log(newValue.value.value);
      // TD WIP Datatype check
      /*if ((newValue.value.dataType as DataType) !== this.opcuaDataType) {
        logger.error(
          `[Tag] new value for tag ${this.path} type ${newValue.value.dataType as DataType} is not assignable to ${this.opcuaDataType}`
        );
        return;
      }*/

      try {
        this.value = this.validate(newValue.value.value);
        this.triggerEmit();
      } catch (error) {
        logger.error(error);
      }
    });

    return variable;
  }

  update(value: ResolveType<DataTypeString>) {
    logger.debug(`[Tag] update() ${this.path} = ${value}`);

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
    this.opcuaVarible.setValueFromSource({
      dataType: this.opcuaDataType,
      arrayType: this.isArray ? VariantArrayType.Array : undefined,
      dimensions:
        this.isArray && this.arrayLength ? [this.arrayLength] : undefined,
      value: newValue,
    });

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

///////////////////////////////////////////////////////////////////////////////////////

/*
type FieldDef = { dataType: string };

export class UdtTag<
  DataTypeString extends BaseTypeStrings,
> extends Tag<DataTypeString> {
  declare dataType: string;

  readonly fields: { [K in keyof DataTypeString]: Tag<DataTypeString> };

  constructor(
    dataType: string,
    opts: TagOptions,
    defs: Record<keyof T, FieldDef>,
    initial?: Partial<T>
  ) {
    super(dataType, opts);
    this.path = path;
    this.fields = {} as any;

    for (const key in defs) {
      const def = defs[key];
      const schema = dataTypeToZod[def.dataType];
      if (!schema) throw new Error(`Unknown dataType ${def.dataType}`);

      this.fields[key] = new Tag<T[typeof key]>(
        `${path}/${String(key)}`,
        schema,
        initial?.[key] ?? schema.parse(undefined) // default
      );
    }
  }

  get value(): T {
    return Object.fromEntries(
      Object.entries(this.fields).map(([k, tag]) => [k, tag.value])
    ) as T;
  }

  set value(newVal: T) {
    for (const [k, v] of Object.entries(newVal)) {
      if (this.fields[k as keyof T]) {
        this.fields[k as keyof T].set(v);
      }
    }
  }
}

const sensorTypeDef = {
  _id: "SensorType",
  fields: {
    Min: { dataType: "Double" },
    Max: { dataType: "Double" },
    Fault: { dataType: "Boolean" },
  },
} as const;

type SensorType = typeof sensorTypeDef.fields;

const sensor = new UdtTag<SensorType>(
  "SensorUDT",
  {
    Min: { dataType: "Double" },
    Max: { dataType: "Double" },
    Fault: { dataType: "Boolean" },
  },
  { Min: 0, Max: 100, Fault: false }
);

console.log(sensor.value);
// { Min: 0, Max: 100, Fault: false }

sensor.fields.Min.set(12.5);
console.log(sensor.value.Min); // 12.5

sensor.value = { Min: 5, Max: 20, Fault: true };
console.log(sensor.fields.Max.value); // 20
*/
