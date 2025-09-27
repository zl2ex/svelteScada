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
  type NodeIdLike,
} from "node-opcua";
import { collections } from "../mongodb/collections";
import { emitToSubscribers } from "../socket.io/socket.io";
import { deviceManager } from "../../../server";
import z from "zod";
import { UdtDefinition, type UdtParams } from "./udt";
import { attempt } from "../../../lib/util/attempt";

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
  dataType: z.string(), // TD WIP Tighten type ?
  nodeId: z.string().optional(),
  writeable: z.boolean().optional(),
  initialValue: z.any().optional(),
  parameters: z.object().optional(),
  exposeOverOpcua: z.boolean().optional(),
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
  return "name" in options && "path" in options && "dataType" in options;
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

function validateExpression(expr: string): void {
  // Only allow safe characters and patterns
  const safeExprRegex =
    /^[0-9+\-*/%().\s]*([A-Za-z_][A-Za-z0-9_]*|Math\.[A-Za-z_][A-Za-z0-9_]*)*[0-9+\-*/%().\s]*$/;

  if (!safeExprRegex.test(expr)) {
    throw new Error(`Unsafe expression: ${expr}`);
  }
}

function resolveTemplate(
  key: string,
  expression: string,
  context: Record<string, any>
): string {
  logger.debug(key);
  logger.debug(expression);
  logger.debug(context);

  return expression.replace(/\$\{([^}]+)\}/g, (_, expr) => {
    try {
      const sandbox = { ...context };
      const script = new vm.Script(expr); // run in vm to prevent code leaks
      const result = String(script.runInNewContext(sandbox));
      return result;
    } catch (e) {
      throw new TagError(key, `[Tag] Failed to evaluate expression: ${expr}`);
    }
  });
}

function isExpression(expr: string | number | boolean): boolean {
  return typeof expr === "string" && expr.includes("${") && expr.includes("}");
}

export function resolveTagOptions(
  udtParams: UdtParams | undefined,
  instanceProps: TagOptions<any>,
  zodSchema: ZodObject
): TagOptions<any> {
  const resolved: TagOptions<any> = {};
  const inProgress = new Set<string>();

  function resolveKey(key: keyof TagOptions<any>, props: TagOptions<any>) {
    //if (!isExpression(resolved[key])) return; // if it doesnt need to be evaluated
    if (
      inProgress.has(key) &&
      typeof resolved[key] === "string" &&
      resolved[key].includes(key)
    ) {
      throw new TagError(
        key,
        `[Tag] Circular reference detected while resolving "${key}"`
      );
    }
    inProgress.add(key);

    const raw = props[key as keyof TagOptions<any>];
    if (isExpression(raw)) {
      // Pass udtProps + already resolved instance props into context
      const res = resolveTemplate(key, raw, {
        ...udtParams,
        ...resolved,
        ...props,
      });

      if (!zodSchema.shape[key]) {
        throw new TagError(
          key,
          `[Tag] unexpected property ${key} in tagOptions`
        );
      }

      // if it expects a number
      if (zodSchema.shape[key].safeParse(0).success) {
        resolved[key] = Number(res);
      }
      // if it expects a boolean
      else if (zodSchema.shape[key].safeParse(true).success) {
        resolved[key] = Boolean(res);
      }
      // if it expects a string
      else {
        resolved[key] = res; // already a string from resolveTempalte
      }
    } else {
      resolved[key] = raw;
    }

    if (!isExpression(resolved[key])) inProgress.delete(key);
  }

  for (const key of Object.keys(instanceProps)) {
    resolveKey(key, instanceProps);
  }

  let tries = 5;
  while (inProgress.keys.length > 0 && tries > 0) {
    for (const key in inProgress) {
      resolveKey(key, resolved);
    }
    tries--;
  }
  return resolved;
}

// TD WIP Make this auto generated from mongodb data
export type TagTypeMapDefinition = {
  "/demo/test": "Double";
  "/demo/testInt32": "Int32";
  "/demo/testInt16": "Int16";
  "/demo/testBool": "Boolean";
  "/demo/digitalIn": "DigitalIn";
};

export type TagTypeMap = {
  [P in keyof TagTypeMapDefinition]: Tag<TagTypeMapDefinition[P]>;
};

export type TagPaths = keyof TagTypeMapDefinition | (string & {});

export type TagOptionsFeildNames = keyof TagOptions<"F"> | (string & {});
class TagError extends Error {
  feildName?: TagOptionsFeildNames;
  constructor(
    feildName: TagOptionsFeildNames,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.feildName = feildName;
  }
}

export class Tag<DataTypeString extends BaseTypeStringsWithArrays> {
  //static tags: TagTypeMap = [];
  static tags: Map<string, Tag<any>> = new Map();
  static opcuaServer: OPCUAServer;
  name: string;
  path: TagPaths; // path that tags are organised by internally
  nodeId?: string; // opcua node path that the tag references to get its value from a driver ect
  dataType: DataTypeString;
  opcuaDataType: DataType;
  isArray: boolean;
  arrayLength: number | undefined;
  writeable: boolean;
  value: ResolveType<DataTypeString>;
  schema:
    | z.ZodNumber
    | z.ZodString
    | z.ZodBoolean
    | z.ZodObject
    | z.ZodArray<z.ZodNumber | z.ZodString | z.ZodBoolean | z.ZodObject>
    | undefined;
  exposeOverOpcua: boolean;
  variable?: UAVariable; // varible used to expose over opcua if exposeOverOpcua is true
  opcuaVarible?: UAVariable; // varible that nodeId points at
  children?: Record<string, Tag<any>>[]; // array of chaildren tags that make up a udt, undeinfed if it is a base tag
  parent?: NodeIdLike; // parent of Udt child if the tag is a UDT
  parameters?: UdtParams; // parameters for building udt path's ect

  error?: TagError; // if any errors exist with the tag

  constructor(
    dataType: DataTypeString,
    options: Omit<TagOptions<DataTypeString>, "dataType">,
    parent?: NodeIdLike
  ) {
    this.path = options.path;

    const opts = attempt(() =>
      resolveTagOptions(
        options.parameters,
        { ...options, dataType },
        Z_TagOptions
      )
    );

    if ("error" in opts) {
      if (opts.error instanceof TagError) {
        this.error = opts.error;
      } else if (opts.error instanceof Error) {
        this.error = new TagError("", opts.error.message);
      }
      logger.error(this.error);
      Tag.tags.set(this.path, this);
      return;
    }

    this.name = opts.data.name;
    this.path = opts.data.path;
    this.nodeId = opts.data.nodeId;
    this.dataType = dataType;

    this.writeable = opts.data.writeable ?? false;
    this.exposeOverOpcua = opts.data.exposeOverOpcua ?? false;

    this.parent = parent;
    //? parent
    //: Tag.opcuaServer.engine.addressSpace?.rootFolder;

    this.parameters = opts.data.parameters;

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
    if (baseDataType in DataType) {
      this.opcuaDataType = baseDataType as unknown as DataType;
      this.schema = getSchema(dataType);
    }

    // is a user defined datatype and therfore a opcua ExtentionObject
    else if (UdtDefinition.udts[dataType]) {
      this.opcuaDataType = DataType.ExtensionObject;
      const udtDefinition =
        UdtDefinition.udts[dataType as keyof typeof UdtDefinition.udts];

      this.children = udtDefinition.buildTagFeilds(
        dataType,
        this.parameters,
        this.parent
      );
      this.schema = z.object();
      for (const [key, childTag] of Object.entries(this.children)) {
        this.schema = this.schema.extend({ [key]: childTag.schema });
      }
    } else {
      const err = new TagError(
        "dataType",
        `[Tag] error while creating tag ${this.path} dataType ${dataType} does not exist in udtDefinitions`
      );
      this.error = err;
      logger.error(err);
      Tag.tags.set(this.path, this);
      return;
    }

    // no inital value given so generate defaults
    // TD WIP DataType
    if (opts.data.initialValue == undefined) {
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
      this.value = this.validate(opts.data.initialValue);
    }

    // subscribe to value from driver if nodeId provided
    if (this.nodeId) {
      const opcuaVarible = attempt(() => this.subscribeByPath(this.nodeId));
      if ("error" in opcuaVarible) {
        if (opcuaVarible.error instanceof TagError) {
          this.error = opcuaVarible.error;
        } else if (opcuaVarible.error instanceof Error) {
          this.error = new TagError(
            "",
            opcuaVarible.error.message,
            opcuaVarible.error
          );
        }
        logger.error(opcuaVarible.error);
        Tag.tags.set(this.path, this);
        return;
      }

      this.opcuaVarible = opcuaVarible.data;
    }

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
    Tag.tags.set(this.path, this);

    logger.info(`[Tag] created new tag ${this.path} = ${this.value}`);
  }

  // supports /folder/*  will get everything in folder
  // /folder/tag**  will get everything in folder that starts with tag eg tag1 and tag2
  static getTagPathsByPath(pattern: string) {
    const regexPattern =
      "^" +
      pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // escape regex specials
        .replace(/\*\*/g, ".*") // ** = match multiple path parts
        .replace(/\*/g, "[^/]+") + // * = match single path part
      "$";

    const regex = new RegExp(regexPattern);
    return [...Tag.tags.keys()].filter((key) => regex.test(key));
  }

  // will throw ZodError if it fails
  private validate(value: unknown): ResolveType<DataTypeString> {
    return this.schema?.parse(value) as ResolveType<DataTypeString>;
  }

  static async loadAllTagsFromDB() {
    // find all tags in the database
    const initTags = collections.tags.find({});
    let tagConfig: TagOptions<any> | null = await initTags.next(); // get next tag from db cursor

    while (tagConfig) {
      if (!isTagOptions(tagConfig)) {
        throw new Error("[Tag] Error loading tag from DB");
      }
      // Is it a primitive datatype eg Bool or Double
      //if(Object.values(DataType).some(type => String(type).startsWith(value.dataType))) {
      //if(value.dataType.includes(Object.values(DataType)))

      try {
        const tag = new Tag(tagConfig.dataType, tagConfig);
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

  static async getAllTagPaths(): Promise<string[]> {
    //return Object.keys(Tag.tags);

    const paths = await collections.tags
      .find({})
      .project({ _id: 0, path: 1 })
      .toArray();

    let pathArray: string[] = [];
    for (const path of paths) {
      pathArray.push(path.path);
    }
    return pathArray;
  }

  subscribeByPath(path: string) {
    const resolvedPath = resolveOpcuaPath(path);
    if (!resolvedPath.deviceName) {
      throw new Error(
        `[Tag] Device at ${path} not found while trying to create tag ${this.path}`
      );
    }

    const device = deviceManager.getDeviceFromPath(resolvedPath.deviceName);
    const variable = device.tagSubscribed(path, this.parent);

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
      logger.debug(`[Tag] Value changed for ${path}: ${newValue.value.value}`);
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
    if (this.writeable == false) {
      logger.warn(
        `[Tag] update ${this.path} failed because writeable is set to false`
      );
      return;
    }

    const newValue = this.validate(value);
    if (this.isArray !== Array.isArray(newValue))
      throw new TypeError(
        `[Tag] Array Type Error - Value ${newValue} is not assignable to tag ${this.path} expected type ${this.dataType}`
      );
    if (this.isArray && this.arrayLength !== newValue?.length)
      throw new TypeError(
        `[Tag] Array Size Error - Value ${newValue} is not assignable to tag ${this.path} expected type ${this.dataType}  - provided length ${newValue.length} expected length ${this.arrayLength}`
      );
    //if(typeof newValue !== typeof this.dataType) throw new Error("Value " + newValue + " is not assignable to tag " + this.nodeId  + " expected type " + this.dataType);
    this.value = newValue;

    if (this.opcuaVarible) {
      this.opcuaVarible.setValueFromSource({
        dataType: this.opcuaDataType,
        arrayType: this.isArray ? VariantArrayType.Array : undefined,
        dimensions:
          this.isArray && this.arrayLength ? [this.arrayLength] : undefined,
        value: newValue,
      });
    }

    if (this.exposeOverOpcua) {
      if (!this.variable) {
        throw new Error(
          `[Tag] path: ${this.path} cannot update OPCUA varible as it is not initalised`
        );
      }
      this.variable?.setValueFromSource({
        dataType: this.opcuaDataType,
        arrayType: this.isArray ? VariantArrayType.Array : undefined,
        //dimensions: this.isArray && this.arrayLength ? [this.arrayLength] : undefined,
        value: newValue,
      });
    }
    this.triggerEmit();

    logger.debug(`[Tag] update ${this.path} = ${value}`);
  }

  triggerEmit() {
    emitToSubscribers({
      path: this.path,
      value: {
        name: this.name,
        path: this.path,
        nodeId: this.nodeId,
        dataType: this.dataType,
        value: this.value,
        writeable: this.writeable,
      },
    });
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
