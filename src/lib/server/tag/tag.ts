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
  DataValue,
  StatusCode,
  type UAObject,
} from "node-opcua";
import { emitToSubscribers, type EmitPayload } from "../socket.io/socket.io";
import { deviceManager } from "../../../server";
import z, { ZodObject } from "zod";
import { Z_UdtParams, type UdtParams } from "./udt";
import { attempt } from "../../../lib/util/attempt";

import vm from "node:vm";
import {
  Node,
  Z_NodeOptions,
  type NodeOptions,
} from "../../client/tag/clientTag.svelte";
import { deleteOpcuaVariable } from "../drivers/opcua/opcuaServer";
import { collections } from "../mongodb/collections";
import { udtManager } from "../../../server/index";

// Base schemas for primitives
export const Z_BaseTypes = {
  Double: z.number().default(0),
  Int16: z.number().int().max(65535).default(0),
  Int32: z.number().int().max(4294967295).default(0), // TD WIP max and min
  Boolean: z.boolean().default(false),
  String: z.string().default(""),
} as const;

export async function getAllDataTypeStrings() {
  const cursor = await collections.udts.find().toArray();
  return [...Object.keys(Z_BaseTypes), ...cursor.map((udt) => udt.name)];
}

// allows each property to be a string expresstion like "${folder}/${name}"
// where folder and name are either parameters or properties of the tagOptions

/*
export interface TagOptionsInput<
  DataTypeString extends BaseTypeStringsWithArrays,
> extends Omit<Node, "type"> {
  dataType: DataTypeString | string;
  writeable?: boolean | string;
  exposeOverOpcua?: boolean | string;
  initalValue?: ResolveType<DataTypeString>;
  parameters?: UdtParams;
  nodeId?: NodeIdLike | string;
  udtParent?: NodeIdLike | string;
}*/

const Z_NodeOptionsWithoutType = Z_NodeOptions.omit({ type: true });
export const Z_TagOptionsInput = Z_NodeOptionsWithoutType.extend({
  dataType: z.string(), // TD WIP Tighten type ?
  nodeId: z.string().optional(),
  writeable: z.boolean().optional().default(false),
  initalValue: z.any().optional(),
  parameters: Z_UdtParams.optional(),
  exposeOverOpcua: z.boolean().optional().default(false),
  udtParent: z.string().optional(),
});

export const Z_tagOptionsInputForm = Z_TagOptionsInput.extend({
  path: z.string(),
});

export type TagOptionsInput<T> = z.input<typeof Z_TagOptionsInput>;

export const Z_TagOptionsResolved = Z_NodeOptionsWithoutType.extend({
  path: z.string(),
  dataType: z.string(), // TD WIP Tighten type ?
  nodeId: z.string().optional(),
  writeable: z.boolean().optional().default(false),
  initalValue: z.any().optional(),
  parameters: Z_UdtParams.optional(),
  exposeOverOpcua: z.boolean().optional().default(false),
  udtParent: z.string().optional(),
});

export type TagOptionsResolved = z.input<typeof Z_TagOptionsResolved>;

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

function isExpression(expr: unknown): boolean {
  return typeof expr === "string" && expr.includes("${") && expr.includes("}");
}

function resolveTagOptions(
  instanceProps: TagOptionsInput<any>,
  udtParams?: UdtParams
): TagOptionsResolved {
  //@ts-ignore
  const resolved: TagOptionsResolved = {};
  const inProgress = new Set<string>();

  function resolveKey(
    key: keyof TagOptionsResolved,
    props: TagOptionsInput<any>
  ) {
    //if (!isExpression(resolved[key])) return; // if it doesnt need to be evaluated

    // TD WIP
    if (
      inProgress.has(key) &&
      isExpression(resolved[key]) // &&
      //resolved[key as keyof typeof resolved].includes(key)
    ) {
      throw new TagError(
        key,
        `[Tag] Circular reference detected while resolving "${key}"`
      );
    }
    inProgress.add(key);

    const raw = props[key];
    if (isExpression(raw)) {
      // Pass udtProps + already resolved instance props into context
      const res = resolveTemplate(key, raw, {
        ...udtParams,
        ...resolved,
        ...props,
        ...props.parameters,
      });

      if (!Z_TagOptionsResolved.shape[key]) {
        throw new TagError(
          key,
          `[Tag] unexpected property ${key} in tagOptions`
        );
      }

      // if it expects a number
      if (Z_TagOptionsResolved.shape[key].safeParse(0).success) {
        resolved[key] = Number(res);
      }
      // if it expects a boolean
      else if (Z_TagOptionsResolved.shape[key].safeParse(true).success) {
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
    resolveKey(key as keyof TagOptionsResolved, instanceProps);
  }

  let tries = 5;
  while (inProgress.keys.length > 0 && tries > 0) {
    for (const key in inProgress) {
      resolveKey(key as keyof TagOptionsResolved, resolved);
    }
    tries--;
  }
  return resolved;
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
  opcuaServer: OPCUAServer;
  tagFolder?: UAObject;
  options: TagOptionsInput<DataTypeString>;
  resolvedOptions: TagOptionsResolved;

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
    | z.ZodNumber
    | z.ZodString
    | z.ZodBoolean
    | z.ZodObject
    | z.ZodArray<z.ZodNumber | z.ZodString | z.ZodBoolean | z.ZodObject>
    | undefined;
  //exposeOverOpcua: boolean = false;
  children: Map<string, Tag<any>>; // array of chaildren tags that make up a udt, undeinfed if it is a base tag
  exposeOpcuaVarible?: UAVariable; // varible used to expose over opcua if exposeOverOpcua is true
  driverOpcuaVarible?: UAVariable; // varible that nodeId points at
  udtParent?: NodeIdLike; // parent of Udt child if the tag is a UDT
  //parameters?: UdtParams; // parameters for building udt path's ect

  error?: TagError; // if any errors exist with the tag

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

  constructor(
    opcuaServer: OPCUAServer,
    tagFolder: UAObject | undefined,
    options: Omit<TagOptionsInput<any>, "path">
  ) {
    super({ ...options, type: "Tag" });
    this.opcuaServer = opcuaServer;
    this.tagFolder =
      tagFolder ?? this.opcuaServer.engine.addressSpace?.rootFolder;
    this.options = { ...options, path: this.path };

    this.resolvedOptions = {
      dataType: "",
      name: "",
      path: "",
      parentPath: "",
    };

    this.children = new Map();
    const opts = attempt(() => resolveTagOptions(this.options));

    if ("error" in opts) {
      if (opts.error instanceof TagError) {
        this.error = opts.error;
      } else if (opts.error instanceof Error) {
        this.error = new TagError("", opts.error.message);
      }
      logger.error(this.error);
      return;
    }

    this.resolvedOptions = opts.data;

    //this.nodeId = opts.data.nodeId;
    //this.dataType = opts.data.dataType;

    //this.writeable = opts.data.writeable ?? false;
    // this.exposeOverOpcua = opts.data.exposeOverOpcua ?? false;

    this.udtParent = opts.data.udtParent;
    //? parent
    //: this.opcuaServer.engine.addressSpace?.rootFolder;

    //this.parameters = opts.data.parameters;

    // pull out the base datatype and the array size if an array is defined
    // eg input Double[2]  =>   ["Double[2], "Double", 2]
    const arrayMatch = this.resolvedOptions.dataType.match(/^(\w+)\[(\d*)\]$/);
    this.isArray = !!arrayMatch || this.resolvedOptions.dataType.endsWith("[]"); // handles arrays of an unkown size
    this.arrayLength = arrayMatch ? parseInt(arrayMatch[2], 10) : 0;

    // type without array size or brackets
    const baseDataType = arrayMatch
      ? arrayMatch[1]
      : this.resolvedOptions.dataType.replace("[]", "");

    const dataType = Object.entries(DataType);
    // is a opcua primative datatype
    if (baseDataType in DataType) {
      this.opcuaDataType = dataType.find(([key, val]) => {
        return key == baseDataType;
      })?.[1] as unknown as DataType;

      const result = attempt(() => getSchema(this.resolvedOptions.dataType));

      if ("error" in result) {
        if (result.error instanceof TagError) {
          this.error = result.error;
        } else if (result.error instanceof Error) {
          this.error = new TagError("initalValue", result.error.message);
        }
        logger.error(this.error);
        return;
      }

      this.schema = result.data;
    }

    // is a user defined datatype and therfore a opcua ExtentionObject
    else {
      this.type = "UdtTag";
      this.opcuaDataType = DataType.ExtensionObject;
      const udtDefinition = udtManager.udts.get(this.resolvedOptions.dataType);
      if (!udtDefinition) {
        const err = new TagError(
          "dataType",
          `[Tag] error while creating tag ${this.path} dataType ${this.resolvedOptions.dataType} does not exist in udtDefinitions`
        );
        this.error = err;
        logger.error(err);
        return;
      }

      udtDefinition
        .buildTagFeilds(this.resolvedOptions, this.resolvedOptions)
        .forEach((tagOptions) => {
          tagOptions.parentPath = this.path + ".";
          const tag = new Tag(this.opcuaServer, this.tagFolder, tagOptions);
          this.children.set(tag.name, tag);
        });

      this.schema = z.object();
      for (const [key, childTag] of this.children.entries()) {
        this.schema = this.schema.extend({ [key]: childTag.schema });
      }
    }

    // subscribe to value from driver if nodeId provided
    if (this.resolvedOptions.nodeId) {
      const opcuaVarible = attempt(() => this.subscribeToDriver());
      if ("error" in opcuaVarible) {
        if (opcuaVarible.error instanceof TagError) {
          this.error = opcuaVarible.error;
        } else if (opcuaVarible.error instanceof Error) {
          this.error = new TagError("", opcuaVarible.error.message);
        }
        logger.error(opcuaVarible.error);
        return;
      }
    }

    if (this.resolvedOptions.exposeOverOpcua) {
      if (!this.opcuaServer?.engine) {
        throw new Error(
          `[Tag] no opcua server defined for tag ${this.path}  please call Tag.initOpcuaServer() and provide a server`
        );
      }
      const namespace = this.opcuaServer.engine.addressSpace!.getOwnNamespace();
      const parent = this.tagFolder;
      this.exposeOpcuaVarible = namespace.addVariable({
        componentOf: parent,
        browseName: this.name,
        nodeId: this.resolvedOptions.nodeId,
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
                error,
                `[Tag] exposeOpcuaVariable set() value failed with error`
              );
              return { statusCode: StatusCodes.BadTypeMismatch };
            }
          },
        },
      });
    }

    // TD WIP DataType
    let initalValue: any;

    if (opts.data.initalValue) {
      const result = attempt(() => this.validate(opts.data.initalValue));
      if ("error" in result) {
        if (result.error instanceof TagError) {
          this.error = result.error;
        } else if (result.error instanceof Error) {
          this.error = new TagError("initalValue", result.error.message);
        }
        logger.error(this.error);
        return;
      }
      initalValue = result.data;
    } else {
      let getDefaults = undefined;
      if (this.schema instanceof ZodObject) getDefaults = {};
      // get intial value defaults from schema
      const result = attempt(() => this.schema?.parse(getDefaults));

      if ("error" in result) {
        if (result.error instanceof TagError) {
          this.error = result.error;
        } else if (result.error instanceof Error) {
          this.error = new TagError("", result.error.message);
        }
        logger.error(this.error);
        return;
      }
      initalValue = result.data;

      if (this.isArray) {
        initalValue = Array(this.arrayLength).fill(initalValue);
      }
    }

    this.update(
      this.driverOpcuaVarible?.readValue().value.value ?? initalValue,
      StatusCodes.UncertainInitialValue
    ); // update tag value when created if it is there, if not set to inital value

    // push instance to tags map referenced by path
    // TD WIP typescript
    logger.debug(`[Tag] created new tag ${this.path} = ${this.value}`);
  }

  [Symbol.dispose]() {
    this.dispose();
  }

  dispose() {
    logger.debug(`[Tag] dispose() ${this.path}`);
    try {
      this.unsubscribeToDriver();

      if (this.exposeOpcuaVarible) {
        if (!this.opcuaServer.engine.addressSpace) {
          throw new Error(
            `[Tag] dispose() this.opcuaServer.engine.addressSpace undefined`
          );
        }
        deleteOpcuaVariable(
          this.opcuaServer.engine.addressSpace,
          this.exposeOpcuaVarible
        );
      }

      this.children.forEach((child) => {
        child.dispose();
      });
    } catch (error) {
      logger.error(error);
    }
  }

  // will throw ZodError if it fails
  private validate(value: unknown): ResolveType<DataTypeString> {
    return this.schema?.parse(value) as ResolveType<DataTypeString>;
  }

  private valueChanged = (newValue: DataValue) => {
    if (
      newValue.value.value == this.value &&
      newValue.statusCode == this.statusCode
    )
      return; // if the tag class called update() already so we have the current value and status code
    logger.trace(
      `[Tag] valueChanged() for ${this.path} = ${newValue.value.value} ${newValue.statusCode.toString()}`
    );

    try {
      if ((newValue.value.dataType as DataType) !== this.opcuaDataType) {
        throw new Error(
          `[Tag] new value for tag ${this.path} type ${newValue.value.dataType} is not assignable to ${this.opcuaDataType}`
        );
      }

      this.value = this.validate(newValue.value.value);
      this.statusCode = newValue.statusCode;
      this.triggerEmit();
    } catch (error) {
      logger.error(error);
    }
  };

  subscribeToDriver() {
    if (!this.resolvedOptions.nodeId) return;

    const resolvedPath = resolveOpcuaPath(this.resolvedOptions.nodeId);
    if (!resolvedPath.deviceName) {
      throw new Error(
        `[Tag] Device at ${this.resolvedOptions.nodeId} not found while trying to create tag ${this.path}`
      );
    }

    const device = deviceManager.getDeviceFromPath(resolvedPath.deviceName);

    const variable = device.tagSubscribed(this); // TD WIP Parent //this.udtParent);

    if (!variable)
      throw new Error(
        `[Tag] failed to subscribe to tag at ${this.resolvedOptions.nodeId} while trying to create tag ${this.path}`
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
    variable.on("value_changed", this.valueChanged);

    this.driverOpcuaVarible = variable;
  }

  unsubscribeToDriver() {
    if (!this.resolvedOptions.nodeId) return;
    const resolvedPath = resolveOpcuaPath(this.resolvedOptions.nodeId);
    if (!resolvedPath.deviceName) {
      logger.error(
        `[Tag] Device at ${this.resolvedOptions.nodeId} not found while trying to unsubscribe from tag ${this.path}`
      );
      return;
    }

    this.driverOpcuaVarible?.removeListener("value_changed", this.valueChanged);
    this.driverOpcuaVarible = undefined;
    const device = deviceManager.getDeviceFromPath(resolvedPath.deviceName);
    device.tagUnsubscribed(this);
  }

  update(value: ResolveType<DataTypeString>, statusCode = StatusCodes.Good) {
    if (this.resolvedOptions.writeable == false) {
      logger.warn(
        `[Tag] update() ${this.path} failed because writeable is set to false`
      );
      this.statusCode = StatusCodes.BadNotWritable;
      this.triggerEmit(); // emit old value back to client
      return;
    }

    const newValue = this.validate(value);
    if (this.isArray !== Array.isArray(newValue))
      throw new TypeError(
        `[Tag] update() Array Type Error - Value ${newValue} is not assignable to tag ${this.path} expected type ${this.resolvedOptions.dataType}`
      );
    if (this.isArray && this.arrayLength !== newValue?.length)
      throw new TypeError(
        `[Tag] update() Array Size Error - Value ${newValue} is not assignable to tag ${this.path} expected type ${this.resolvedOptions.dataType}  - provided length ${newValue.length} expected length ${this.arrayLength}`
      );
    //if(typeof newValue !== typeof this.dataType) throw new Error("Value " + newValue + " is not assignable to tag " + this.nodeId  + " expected type " + this.dataType);

    this.value = newValue;
    this.statusCode = statusCode;
    if (this.driverOpcuaVarible) {
      this.driverOpcuaVarible.setValueFromSource(
        {
          dataType: this.opcuaDataType,
          arrayType: this.isArray ? VariantArrayType.Array : undefined,
          dimensions:
            this.isArray && this.arrayLength ? [this.arrayLength] : undefined,
          value: newValue,
        },
        this.statusCode
      );
    }

    if (this.resolvedOptions.exposeOverOpcua) {
      if (!this.exposeOpcuaVarible) {
        throw new Error(
          `[Tag] update() path: ${this.path} cannot update exposeOpcuaVariable as it is not initalised`
        );
      }
      this.exposeOpcuaVarible?.setValueFromSource(
        {
          dataType: this.opcuaDataType,
          arrayType: this.isArray ? VariantArrayType.Array : undefined,
          //dimensions: this.isArray && this.arrayLength ? [this.arrayLength] : undefined,
          value: newValue,
        },
        this.statusCode
      );
    }

    this.triggerEmit();
    logger.trace(
      `[Tag] update() ${this.path} = ${value} : ${this.driverOpcuaVarible?.readValue().statusCode.toString()}`
    );
  }

  getEmitPayload(): EmitPayload {
    return {
      path: this.path,
      value: {
        name: this.name,
        path: this.path,
        options: this.options,
        parameters: this.parameters,
        value: this.value,
        statusCodeString: this.statusCode.name,
        errorMessage: this.error?.message,
        children: this.children
          ? Array.from(this.children).map(([path, tag]) => tag.getEmitPayload())
          : undefined,
      },
    };
  }

  triggerEmit() {
    emitToSubscribers(this.getEmitPayload());
  }
}
