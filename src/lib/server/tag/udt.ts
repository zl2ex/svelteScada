import { DataType, OPCUAServer, type UAObject } from "node-opcua";
import {
  Tag,
  TagOptionsResolved,
  Z_TagOptionsInput,
  type TagOptionsInput,
} from "./tag";
import z from "zod";

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


type UdtClassMap<Udts extends UdtDefinitionWithTypedDefaults> = {
  [UdtName in keyof Udts]: {
    [FieldName in keyof Udts[UdtName]["fields"]]:
      ExtractFieldType<
        Udts[UdtName]["fields"][FieldName]["dataType"],
        UdtClassMap<Udts>
      >;
  };
};
*/

//export type UdtParams = Record<string, UdtParam>;

//export type UdtParams = Record<string, number | boolean | string>;

export const Z_UdtParams = z.record(
  z.string(),
  z.union([
    z.object({ type: z.literal("string"), default: z.string() }),
    z.object({ type: z.literal("number"), default: z.number() }),
    z.object({ type: z.literal("boolean"), default: z.boolean() }),
  ])
);

export type UdtParams = z.input<typeof Z_UdtParams>;

export const Z_UdtDefinitionOptions = z.object({
  name: z.string(),
  parameters: Z_UdtParams,
  feilds: z.array(Z_TagOptionsInput),
});

export type UdtDefinitionOptions = z.input<typeof Z_UdtDefinitionOptions>;

export class UdtDefinition {
  name: string;
  options: UdtDefinitionOptions;

  constructor(opts: UdtDefinitionOptions) {
    this.name = opts.name;
    console.debug(opts);
    this.options = opts; // TD WIP ZOD Z_UdtDefinitionOptions.parse(opts);
    //this.initalValue = opts.initalValue;
  }

  buildTagFeilds(
    parentTagOptions: TagOptionsResolved,
    tagOverrideOptions?: Record<string, TagOptionsInput<any>>
  ) {
    // instance parameters overide udt parameters

    let parameters = this.options.parameters ?? {};
    if (this.options.parameters && parentTagOptions?.parameters) {
      for (const [key, udtDefParameter] of Object.entries(
        this.options.parameters
      )) {
        if (parentTagOptions?.parameters[key]) {
          parameters[key] = parentTagOptions?.parameters[key];
        }
      }
    }

    const feilds = new Map<string, TagOptionsInput<any>>();
    for (let options of this.options.feilds) {
      let override = undefined;
      if (tagOverrideOptions && tagOverrideOptions[options.name]) {
        override = tagOverrideOptions[options.name];
      }

      console.debug("[Udt] buildTagFeilds() override", override);

      options.udtParent = this.name;
      options.parameters = parameters;
      options.exposeOverOpcua =
        options.exposeOverOpcua ?? parentTagOptions.exposeOverOpcua;
      options.initalValue = options.initalValue ?? parentTagOptions.initalValue;
      options.nodeId = options.nodeId ?? parentTagOptions.nodeId;
      options.writeable = options.writeable ?? parentTagOptions.writeable;

      if (override) {
        for (const [key, value] of Object.entries(override)) {
          if (key in options) {
            options[key as keyof typeof options] = value;
            if (!options.overrides) options.overrides = {};
            options.overrides[key] = value;
            console.debug(value);
          }
        }
      }

      feilds.set(options.name, options);
    }

    return feilds;
  }
}

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

/*
import { z, ZodType, ZodObject, ZodBoolean, ZodNumber, ZodString } from "zod";
import Mexp from "math-expression-evaluator";
import { constants } from "node:buffer";



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
