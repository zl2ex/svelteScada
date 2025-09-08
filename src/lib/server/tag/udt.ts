import { type Namespace, type UAObject, DataType } from "node-opcua";
import { logger } from "../../../lib/pino/logger";
import { Tag, type TagOptions } from "./tag";
import { udtDefinitions } from "./udtDefinitions";
import vm from "node:vm";

export type BaseDataTypeMap = {
  Double: number;
  Float: number;
  Int32: number;
  UInt32: number;
  Boolean: boolean;
  String: string;
  // Extend this as needed
};

// Runtime enum-to-type map
const dataTypeMap = {
  Boolean: DataType.Boolean,
  SByte: DataType.SByte,
  Byte: DataType.Byte,
  Int16: DataType.Int16,
  UInt16: DataType.UInt16,
  Int32: DataType.Int32,
  UInt32: DataType.UInt32,
  Int64: DataType.Int64,
  UInt64: DataType.UInt64,
  Float: DataType.Float,
  Double: DataType.Double,
  String: DataType.String,
  DateTime: DataType.DateTime,
  Guid: DataType.Guid,
  ByteString: DataType.ByteString,
} satisfies Record<string, DataType>;

export type ValidBaseDataType = keyof typeof dataTypeMap; // e.g. "Double", "Boolean"

// Accepts things like "Double", "Double[]", "Double[3]"
export type ValidDataTypeString =
  | ValidBaseDataType
  | `${ValidBaseDataType}[]`
  | `${ValidBaseDataType}[${number}]`;

type ValidBaseType = keyof typeof dataTypeMap;

/*type FieldDef = {
  dataType: ValidDataTypeString; // This is now validated at compile time!
  initalValue: BaseTypeMap[.dataType]
};*/

type BuildTuple<T, N extends number, R extends T[] = []> = R["length"] extends N
  ? R
  : BuildTuple<T, N, [...R, T]>;

type ParseDataType<T extends string> = T extends `${infer Base}[${infer N}]`
  ? Base extends keyof BaseDataTypeMap
    ? N extends `${infer Num extends number}`
      ? BuildTuple<BaseDataTypeMap[Base], Num>
      : BaseDataTypeMap[Base][]
    : never
  : T extends keyof BaseDataTypeMap
    ? BaseDataTypeMap[T]
    : never;

type AllDataTypeStrings =
  | keyof BaseDataTypeMap
  | `${keyof BaseDataTypeMap}[${number}]`
  | `${keyof BaseDataTypeMap}[]`;

type FieldDefinition = {
  [K in AllDataTypeStrings]: {
    nodeId: string;
    dataType: K;
    initialValue: ParseDataType<K>;
  };
}[AllDataTypeStrings];

type UdtDefinition = {
  parameters?: object;
  fields: Record<string, FieldDefinition>;
};

let test: UdtDefinition["Double[20]"];

export type UdtTypes = Record<string, UdtDefinition>;

type ParsedField = {
  name: string;
  base: ValidBaseType;
  size: number | undefined;
  dataType: DataType;
};

// 2. Helper to build fixed-length arrays
export type FixedLengthArray<
  T,
  N extends number,
  A extends T[] = [],
> = A["length"] extends N ? A : FixedLengthArray<T, N, [...A, T]>;

// 3. Parse types like "Double[2]" or "Position[]" into structured data
/*export type ParseDataType<T extends string> =
  T extends `${infer Base}[${infer Len}]`
    ? Len extends '' // "Position[]" case
      ? { base: Base; array: true }
      : { base: Base; array: true; length: Len extends `${infer N extends number}` ? N : never }
    : { base: T; array: false };

// 4. Convert a type string to a concrete TypeScript type
export type ExtractFieldType<
  T extends string,
  AllUdts extends Record<string, any>
> =
  ParseDataType<T> extends infer Parsed
    ? Parsed extends { base: infer B; array: infer A; length?: infer L }
      ? B extends keyof BaseTypeMap
        ? A extends true
          ? L extends number
            ? FixedLengthArray<BaseTypeMap[B], L>
            : BaseTypeMap[B][]
          : BaseTypeMap[B]
        : B extends keyof AllUdts
          ? A extends true
            ? L extends number
              ? FixedLengthArray<AllUdts[B], L>
              : AllUdts[B][]
            : AllUdts[B]
          : never
      : never
    : never;

// 5. Main structure of a UDT field
export type UdtFieldDefinition = {
  dataType: string;
  initalValue?: any;
};

// 6. Top-level structure for all UDTs
export type UdtDefinitionWithTypedDefaults = {
  [UdtName: string]: {
    fields: {
      [FieldName: string]: UdtFieldDefinition;
    };
  };
};

// 7. Generate concrete TypeScript class types from a UDT definition
export type UdtClassMap<
  Udts extends UdtDefinitionWithTypedDefaults
> = {
  [UdtName in keyof Udts]: {
    [FieldName in keyof Udts[UdtName]['fields']]:
      ExtractFieldType<
        Udts[UdtName]['fields'][FieldName]['dataType'],
        UdtClassMap<Udts>
      >;
  };
};

//export type UdtTypes = UdtClassMap<typeof udtDefinitions>;

export function parseDataTypeString(input: string): { base: ValidBaseType; size?: number } | null {
  const match = input.match(/^(\w+)(?:\[(\d*)\])?$/);
  if (!match) return null;

  const [, baseRaw, sizeRaw] = match;

  if (!Object.prototype.hasOwnProperty.call(dataTypeMap, baseRaw)) return null;

  const base = baseRaw as ValidBaseType;
  const size = sizeRaw === "" ? undefined : sizeRaw ? parseInt(sizeRaw, 10) : undefined;

  return { base, size };
}

function parseUdt(udt: UdtFile): Record<string, ParsedField[]> {
  const result: Record<string, ParsedField[]> = {};

  for (const [udtName, def] of Object.entries(udt)) {
    const parsedFields: ParsedField[] = [];

    for (const [fieldName, field] of Object.entries(def.fields)) {
      const parsed = parseDataTypeString(field.dataType);
      if (!parsed) throw new Error(`Invalid dataType "${field.dataType}" in ${udtName}.${fieldName}`);

      parsedFields.push({
        name: fieldName,
        base: parsed.base,
        size: parsed.size,
        dataType: dataTypeMap[parsed.base],
      });
    }

    result[udtName] = parsedFields;
  }

  return result;
}

/*
type UdtClassMap<Udts extends UdtDefinitionWithTypedDefaults> = {
  [UdtName in keyof Udts]: {
    [FieldName in keyof Udts[UdtName]["fields"]]:
      ExtractFieldType<
        Udts[UdtName]["fields"][FieldName]["dataType"],
        UdtClassMap<Udts>
      >;
  };
};

export type UdtOptions = {
  name: string;
  feilds: TagOptions[];
  namespace: Namespace;
  parent: UAObject;
  parameters?: object;
};*/

/*
export class UdtDefinition {
  nodeId: string;
  feilds: Tag[] = [];
  namespace: Namespace;
  parent: UAObject;

  parameters?: object;

  constructor(opts: UdtDefinitionOptions) {
    this.nodeId = opts.nodeId;
    this.namespace = opts.namespace;
    this.parent = opts.parent;
    //this.feilds = opts.feilds;
    this.parameters = opts.parameters;
    for (const tagOptions of opts.feilds) {
      this.feilds.push(new Tag(tagOptions, this.namespace, this.parent));
    }
    //this.buildFields(this.nodeId, schema, opts.initialValue)
  }

};

// list of all the udt's loaded by their name
export const udt: Record<string, UdtDefinition> = {};


function buildFields(path: string, schema: any, initial: any): Tag[] {
  const fields: Tag[] = [];

  for (const [name, def] of Object.entries(schema.value)) {

      //const isArray = def.endsWith("[]");
      //const baseType = isArray ? def.slice(0, -2) : def;

      // Match "Double", "Double[]", or "Double[3]"
      const arrayMatch = def.dataType.match(/^(\w+)\[(\d*)\]$/);
      const isArray = !!arrayMatch || def.dataType.endsWith("[]");
      const baseType = arrayMatch ? arrayMatch[1] : def.type.replace("[]", "");
      const arrayLength = arrayMatch ? parseInt(arrayMatch[2], 10) : undefined;

      let resolvedInitial = def.initialValue;
      if (isArray && arrayLength !== undefined && !Array.isArray(def.initialValue)) {
        resolvedInitial = Array(arrayLength).fill(null); // or fill with default base type
      }

      fields.push(new Tag({
        name: name,
        nodeId: def.nodeId,
        dataType: baseType,
        isArray,
        arrayLength,
        writable: def.writable,
        initialValue: def.inialValue
      }));
  
    /*else {
      // Nested object (struct or namespace)
      fields.push(...buildFields(name, def));
    }
  }

  return fields;
}
*/
/*
export class UdtTag {

  name: string;
  nodeId: string;
  dataType: string;
  isArray: boolean;
  value: any;
  writable: boolean;
  variable?: UAObject;
  parameters?: any;
  tags: Tag[] = [];
  onUpdate?: (value: any) => void;
  emit?: (event: string, payload: emitPayload) => void;

  constructor(opts: UdtTagOptions) {
    this.name = opts.name;
    this.nodeId = opts.nodeId ?? `ns=1;s=${opts.name}`;
    this.dataType = opts.dataType;
    this.writable = opts.writable ?? false;
    this.parameters = opts.parameters ?? undefined;
    this.isArray = opts.isArray ?? false;
    this.value = opts.initialValue ?? null;
    this.onUpdate = opts.onUpdate;
    this.emit = opts.emit;


    const udtDefinition = udtDefinitoons[this.dataType];
    if(!udtDefinition) throw new Error(`UDT type ${this.dataType} not found in udt.json`);

    this.tags = buildFields(this.name, udtDefinition, opts.initialValue || {});

  }

  init(namespace: Namespace, parent: UAObject) {
    this.variable = namespace.addObject({
      organizedBy: parent,
      browseName: this.name,
      nodeId: this.nodeId
    });

    console.log(this.tags);

    for (const child of this.tags) {
      child.init(namespace, this.variable);
    }
  }

  update(newValue: any) {
    if (typeof newValue !== "object") return;
    for (const child of this.tags) {
      const path = child.name.replace(`${this.name}.`, "").split(".");
      let val = newValue;
      for (const part of path) val = val?.[part];
      if (val !== undefined) child.update(val);
    }
    this._triggerUpdate();
  }

  _triggerUpdate() {
    const structured: any = {};
    for (const child of this.tags) {
      const path = child.name.replace(`${this.name}.`, "").split(".");
      let ptr = structured;
      for (let i = 0; i < path.length - 1; i++) {
        ptr[path[i]] ??= {};
        ptr = ptr[path[i]];
      }
      ptr[path.at(-1)!] = child.value;
    }
    this.value = structured;
    this.emit?.("tag:update", { name: this.name, value: structured });
    this.onUpdate?.(structured);
  }
}


function parseFieldType(raw: string): { fieldType: string; isArray: boolean } {
  if (raw.endsWith("[]")) {
    return { fieldType: raw.slice(0, -2), isArray: true };
  }
  return { fieldType: raw, isArray: false };
}

export function registerCustomDataTypes(addressSpace: AddressSpace, schemas: Record<string, any>) {
  const factory = getStandardDataTypeFactory("urn:custom-namespace");

  for (const [typeName, fields] of Object.entries(schemas)) {
    const structured: StructuredTypeSchema = {
      name: typeName,
      baseType: "ExtensionObject",
      fields: []
    };

    for (const [fieldName, rawType] of Object.entries(fields)) {
      if (typeof rawType === "object") {
        // Nested structure
        structured.fields.push({
          name: fieldName,
          fieldType: "ExtensionObject",
          isArray: false
        });
        continue;
      }

      const { fieldType, isArray } = parseFieldType(rawType);
      structured.fields.push({ name: fieldName, fieldType, isArray });
    }

    factory.registerStructuredType(structured);
    registerObject(factory.getStructureInfo(typeName)!);
    typeMap[typeName] = factory.constructObject(structured.name);
  }

  addressSpace.registerDataTypeFactory("urn:custom-namespace", factory);
}





*/
import { z, ZodType, ZodObject, ZodBoolean, ZodNumber, ZodString } from "zod";

export type UdtParam =
  | { type: "number"; default: number }
  | { type: "string"; default: string }
  | { type: "boolean"; default: boolean };

type UdtParamTypes = UdtParam["type"];

export type UdtParams = Record<string, UdtParam>;

export type UdtOptions = {
  name: string;
  props: UdtParam[];
  children: TagOptions<any>[]; // TD WIP
};
/*
export interface TagInstanceDoc {
  _id: string;
  udt: string;
  props: Record<string, string | number | boolean>;
}*/

// Build Zod schema from UDT
function buildPropsSchema(udtProps: UdtParams) {
  const shape: Record<UdtParamTypes, z.ZodType> = {
    number: z.number(),
    string: z.string(),
    boolean: z.boolean(),
  };

  let schema: Record<string, z.ZodType> = {};
  for (const [key, def] of Object.entries(udtProps)) {
    schema[key] = shape[def.type].default(def.default);
  }
  return z.object(schema);
}

/*
// === Expression Evaluator ===
function resolveExpression(expr: string, context: Record<string, any>): any {
  // Replace props like ${baseAddr + 1}
  return expr.replace(/\$\{([^}]+)\}/g, (_, code) => {
    try {
      // Only allow access to context keys + math
      const fn = new Function(...Object.keys(context), `return (${code});`);
      return fn(...Object.values(context));
    } catch (err) {
      throw new Error(`Invalid expression: ${expr} -> ${err}`);
    }
  });
}

// === Main Resolver ===
export function resolveUdtProps(
  udtProps: UdtProps,
  instanceProps: Record<string, any>
) {
  const schema = buildPropsSchema(udtProps);
  // Context for resolving expressions = all UDT defaults + instance overrides
  const context = Object.fromEntries(
    Object.entries(udtProps).map(([k, v]) => [k, instanceProps[k] ?? v.default])
  );

  // Resolve only instance props
  const resolved: Record<string, any> = {};
  for (const [key, val] of Object.entries(instanceProps)) {
    if (typeof val === "string" && val.includes("${")) {
      resolved[key] = resolveExpression(val, context);
    } else {
      resolved[key] = val;
    }
  }
  // Final validation
  return schema.parse(resolved);
}*/

function validateExpression(expr: string): void {
  // Only allow safe characters and patterns
  const safeExprRegex =
    /^[0-9+\-*/%().\s]*([A-Za-z_][A-Za-z0-9_]*|Math\.[A-Za-z_][A-Za-z0-9_]*)*[0-9+\-*/%().\s]*$/;

  if (!safeExprRegex.test(expr)) {
    throw new Error(`Unsafe expression: ${expr}`);
  }
}

function resolveTemplate(str: string, context: Record<string, any>): string {
  return str.replace(/\$\{([^}]+)\}/g, (_, expr) => {
    try {
      const sandbox = { ...context };
      const script = new vm.Script(expr); // run in vm to prevent code injection
      const result = String(script.runInNewContext(sandbox));
      return result;
    } catch (e) {
      throw new Error(`[Udt] Failed to evaluate expression: ${expr}`);
    }
  });
}

function isExpression(expr: string | number | boolean): boolean {
  return typeof expr === "string" && expr.includes("${") && expr.includes("}");
}

export function resolveInstanceProps(
  udtParams: Record<string, boolean | number | string>,
  instanceProps: TagOptions<any>,
  zodSchema: ZodObject
): Record<string, unknown> {
  const resolved: Record<string, boolean | number | string> = {};
  const inProgress = new Set<string>();

  function resolveKey(key: string, props: TagOptions<any>) {
    //if (!isExpression(resolved[key])) return; // if it doesnt need to be evaluated
    if (
      inProgress.has(key) &&
      typeof resolved[key] === "string" &&
      resolved[key].includes(key)
    ) {
      throw new Error(
        `[Udt] Circular reference detected while resolving "${key}"`
      );
    }
    inProgress.add(key);

    const raw = props[key as keyof TagOptions<any>];
    if (isExpression(raw)) {
      // Pass udtProps + already resolved instance props into context
      const res = resolveTemplate(raw, {
        ...udtParams,
        ...resolved,
        ...props,
      });

      if (!zodSchema.shape[key]) {
        throw new Error(`[Udt] unexpected property ${key} in tagOptions`);
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

  console.log(resolved);

  for (const key of inProgress) {
    console.log(key);
    resolveKey(key, resolved);
  }

  console.log(resolved);

  return resolved;
}

/*
import { z, ZodType, ZodObject, ZodBoolean, ZodNumber, ZodString } from "zod";
import Mexp from "math-expression-evaluator";
import { constants } from "node:buffer";

type UdtParams = Record<string, number | boolean | string>;

function resolveTemplate(str: string, udtParams: UdtParams): string {
  const expr = new Mexp();

  return str.replace(/\$\{([^}]+)\}/g, (_, expression) => {
    try {
      console.log(expression);
      const result = expr.eval(expression.trim(), udtParams, constants);
      return String(result);
    } catch (e) {
      logger.error(e);
      return `\${${expression}}`; // fallback: leave as-is
    }
  });
}

export function resolveExpressions<
  T extends ZodObject<any>, // require object schema
>(udtParams: UdtParams, instanceProps: unknown, schema: T): z.infer<T> {
  const expr = new Mexp();
  const shape = schema.shape; // schema field types

  const resolved = Object.fromEntries(
    Object.entries(instanceProps as Record<string, unknown>).map(
      ([key, value]) => {
        console.log(key, value);
        if (typeof value === "string") {
          let resolved = resolveTemplate(value, udtParams);
          console.log(resolved);
          // look at the expected Zod type
          const expected = shape[key] as ZodType | undefined;

          if (expected instanceof ZodBoolean) {
            // coerce truthy/falsy to boolean
            if (typeof resolved === "number") {
              resolved = resolved !== 0;
            } else {
              resolved = Boolean(resolved);
            }
          } else if (expected instanceof ZodNumber) {
            // coerce to number if possible
            if (typeof resolved !== "number") {
              const num = Number(resolved);
              if (!Number.isNaN(num)) {
                resolved = num;
              }
            }
          } else if (expected instanceof ZodString) {
            resolved = String(resolved);
          }
          // else: leave result as is (supports nested objects, arrays, etc.)
          return [key, resolved];
        }
        return [key, value];
      }
    )
  );

  return schema.parse(resolved); // validate & coerce final result
}
*/
