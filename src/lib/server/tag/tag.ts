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
import { emitToSubscribers, type EmitPayload } from "../socket.io/socket.io";
import { deviceManager } from "../../../server";
import z from "zod";
import { UdtDefinition, type UdtParams } from "./udt";
import { attempt } from "../../../lib/util/attempt";

import vm from "node:vm";
import {
  Node,
  type NodeOptions,
} from "../../../lib/client/tag/tagState.svelte";

// Base schemas for primitives
export const Z_BaseTypes = {
  Double: z.number(),
  Int16: z.number().int().max(65535),
  Int32: z.number().int().max(4294967295), // TD WIP max and min
  Boolean: z.boolean(),
  String: z.string(),
} as const;

// allows each property to be a string expresstion like "${folder}/${name}"
// where folder and name are either parameters or properties of the tagOptions
export interface TagOptionsInput<
  DataTypeString extends BaseTypeStringsWithArrays,
> extends NodeOptions {
  dataType: DataTypeString | string;
  writeable?: boolean | string;
  exposeOverOpcua?: boolean | string;
  initalValue?: ResolveType<DataTypeString>;
  parameters?: UdtParams;
  nodeId?: NodeId | NodeIdLike | string;
  udtParent?: NodeId | NodeIdLike | string;
}
export class TagOptions<
  DataTypeString extends BaseTypeStringsWithArrays,
> extends Node {
  dataType: DataTypeString;
  writeable: boolean;
  exposeOverOpcua: boolean;
  initalValue?: ResolveType<DataTypeString>;
  parameters?: UdtParams;
  nodeId?: NodeId | NodeIdLike;
  udtParent?: NodeId | NodeIdLike;

  static validateExpression(expr: string): void {
    // Only allow safe characters and patterns
    const safeExprRegex =
      /^[0-9+\-*/%().\s]*([A-Za-z_][A-Za-z0-9_]*|Math\.[A-Za-z_][A-Za-z0-9_]*)*[0-9+\-*/%().\s]*$/;

    if (!safeExprRegex.test(expr)) {
      throw new Error(`Unsafe expression: ${expr}`);
    }
  }

  static zodSchema = z.object({
    name: z.string(),
    path: z.string(),
    parentPath: z.string(),
    dataType: z.string(), // TD WIP Tighten type ?
    nodeId: z.string().optional(),
    writeable: z.boolean().optional(),
    initialValue: z.any().optional(),
    parameters: z.object().optional(),
    exposeOverOpcua: z.boolean().optional(),
  });

  static resolveTemplate(
    key: string,
    expression: string,
    context: Record<string, any>
  ): string {
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

  static isExpression(expr: unknown): boolean {
    return (
      typeof expr === "string" && expr.includes("${") && expr.includes("}")
    );
  }

  resolveTagOptions(
    instanceProps: TagOptionsInput<any>,
    udtParams?: UdtParams
  ): TagOptions<any> {
    const resolved: TagOptions<any> = {};
    const inProgress = new Set<string>();

    function resolveKey(key: string, props: TagOptionsInput<any>) {
      //if (!isExpression(resolved[key])) return; // if it doesnt need to be evaluated

      // TD WIP
      if (
        inProgress.has(key) &&
        TagOptions.isExpression(resolved[key as keyof typeof resolved]) // &&
        //resolved[key as keyof typeof resolved].includes(key)
      ) {
        throw new TagError(
          key,
          `[Tag] Circular reference detected while resolving "${key}"`
        );
      }
      inProgress.add(key);

      const raw = props[key as keyof TagOptionsInput<any>];
      if (TagOptions.isExpression(raw)) {
        // Pass udtProps + already resolved instance props into context
        const res = TagOptions.resolveTemplate(key, raw, {
          ...udtParams,
          ...resolved,
          ...props,
          ...props.parameters,
        });

        if (!TagOptions.zodSchema.shape[key]) {
          throw new TagError(
            key,
            `[Tag] unexpected property ${key} in tagOptions`
          );
        }

        // if it expects a number
        if (TagOptions.zodSchema.shape[key].safeParse(0).success) {
          resolved[key as keyof typeof resolved] = Number(res);
        }
        // if it expects a boolean
        else if (TagOptions.zodSchema.shape[key].safeParse(true).success) {
          resolved[key as keyof typeof resolved] = Boolean(res);
        }
        // if it expects a string
        else {
          resolved[key as keyof typeof resolved] = res; // already a string from resolveTempalte
        }
      } else {
        resolved[key as keyof typeof resolved] = raw;
      }

      if (!TagOptions.isExpression(resolved[key])) inProgress.delete(key);
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

  constructor(options: TagOptionsInput<DataTypeString>) {
    super(options);
    let opts = this.resolveTagOptions(options);
    this.name = opts.name;
    this.path = opts.path;
    this.parentPath = opts.parentPath;
    this.dataType = opts.dataType;
    this.writeable = opts.writeable ?? false;
    this.exposeOverOpcua = opts.exposeOverOpcua ?? false;
    this.initalValue = opts.initalValue;
    this.parameters = opts.parameters;
    this.nodeId = opts.nodeId;
  }
}

//export type TagOptions<T> = z.input<typeof Z_TagOptions>;
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

export type TagOptionsFeildNames = keyof TagOptionsInput<any> | (string & {});
export class TagError extends Error {
  feildName: TagOptionsFeildNames;
  message: string;
  constructor(feildName: TagOptionsFeildNames, message: string) {
    super(message);
    this.message = message;
    this.feildName = feildName;
  }
}

export class Tag<
  DataTypeString extends BaseTypeStringsWithArrays,
> extends Node {
  //static tags: TagTypeMap = [];
  static opcuaServer: OPCUAServer;
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
  udtParent?: NodeIdLike; // parent of Udt child if the tag is a UDT
  parameters?: UdtParams; // parameters for building udt path's ect

  error?: TagError; // if any errors exist with the tag

  constructor(options: TagOptionsInput<any>) {
    options.type = "Tag";
    super(options);
    const opts = attempt(() => new TagOptions(options));

    if ("error" in opts) {
      if (opts.error instanceof TagError) {
        this.error = opts.error;
      } else if (opts.error instanceof Error) {
        this.error = new TagError("", opts.error.message);
      }
      logger.error(this.error);
      return;
    }

    this.name = opts.data.name;
    this.path = opts.data.path;
    this.nodeId = opts.data.nodeId;
    this.dataType = opts.data.dataType;

    this.writeable = opts.data.writeable ?? false;
    this.exposeOverOpcua = opts.data.exposeOverOpcua ?? false;

    this.udtParent = opts.data.udtParent;
    //? parent
    //: Tag.opcuaServer.engine.addressSpace?.rootFolder;

    this.parameters = opts.data.parameters;

    // pull out the base datatype and the array size if an array is defined
    // eg input Double[2]  =>   ["Double[2], "Double", 2]
    const arrayMatch = this.dataType.match(/^(\w+)\[(\d*)\]$/);
    this.isArray = !!arrayMatch || this.dataType.endsWith("[]"); // handles arrays of an unkown size
    this.arrayLength = arrayMatch ? parseInt(arrayMatch[2], 10) : undefined;

    // type without array size or brackets
    const baseDataType = arrayMatch
      ? arrayMatch[1]
      : this.dataType.replace("[]", "");

    // is a opcua primative datatype
    if (baseDataType in DataType) {
      this.opcuaDataType = baseDataType as unknown as DataType;
      this.schema = getSchema(this.dataType);
    }

    // is a user defined datatype and therfore a opcua ExtentionObject
    else if (UdtDefinition.udts[this.dataType]) {
      this.opcuaDataType = DataType.ExtensionObject;
      const udtDefinition =
        UdtDefinition.udts[this.dataType as keyof typeof UdtDefinition.udts];

      this.children = udtDefinition.buildTagFeilds(
        this.dataType,
        this.parameters
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
      return;
    }

    // no inital value given so generate defaults
    // TD WIP DataType
    if (opts.data.initialValue == undefined) {
      if (
        this.dataType === "Double" ||
        this.dataType === "Int32" ||
        this.dataType === "Boolean"
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
          this.error = new TagError("", opcuaVarible.error.message);
        }
        logger.error(opcuaVarible.error);
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
    logger.info(`[Tag] created new tag ${this.path} = ${this.value}`);
  }

  // will throw ZodError if it fails
  private validate(value: unknown): ResolveType<DataTypeString> {
    return this.schema?.parse(value) as ResolveType<DataTypeString>;
  }

  subscribeByPath(path: string) {
    const resolvedPath = resolveOpcuaPath(path);
    if (!resolvedPath.deviceName) {
      throw new Error(
        `[Tag] Device at ${path} not found while trying to create tag ${this.path}`
      );
    }

    const device = deviceManager.getDeviceFromPath(resolvedPath.deviceName);
    const variable = device.tagSubscribed(path, this.path);

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

  getEmitPayload(): EmitPayload {
    return {
      path: this.path,
      value: {
        type: this.type,
        name: this.name,
        path: this.path,
        parentPath: this.parentPath,
        nodeId: this.nodeId,
        dataType: this.dataType,
        value: this.value,
        writeable: this.writeable,
        error: this.error,
      },
    };
  }

  triggerEmit() {
    emitToSubscribers(this.getEmitPayload());
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
