
import { type Namespace, type UAObject, DataType } from "node-opcua";
import { logger } from "../../../lib/pino/logger";
import { Tag, type TagOptions } from "./tag";
import { udtDefinitions } from "./udtDefinitions";


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

type BuildTuple<T, N extends number, R extends T[] = []> =
  R['length'] extends N ? R : BuildTuple<T, N, [...R, T]>;

type ParseDataType<T extends string> =
  T extends `${infer Base}[${infer N}]`
    ? Base extends keyof BaseDataTypeMap
      ? N extends `${infer Num extends number}`
        ? BuildTuple<BaseDataTypeMap[Base], Num>
        : BaseDataTypeMap[Base][]
      : never
    : T extends keyof BaseDataTypeMap
      ? BaseDataTypeMap[T]
      : never;

type AllDataTypeStrings = 
  keyof BaseDataTypeMap | 
  `${keyof BaseDataTypeMap}[${number}]` |
  `${keyof BaseDataTypeMap}[]`;

type FieldDefinition = {
  [K in AllDataTypeStrings]: {
    nodeId: string;
    dataType: K;
    initialValue: ParseDataType<K>;
  }
}[AllDataTypeStrings];

type UdtDefinition = {
  parameters?: object;
  fields: Record<string, FieldDefinition>;
};

let test: UdtDefinition["Double[20]"]

export type UdtTypes = Record<string, UdtDefinition>;

type ParsedField = {
  name: string;
  base: ValidBaseType;
  size: number | undefined;
  dataType: DataType;
};

// 2. Helper to build fixed-length arrays
export type FixedLengthArray<T, N extends number, A extends T[] = []> =
  A['length'] extends N ? A : FixedLengthArray<T, N, [...A, T]>;

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
};*/

export interface UdtDefinitionOptions {
  nodeId: string;
  feilds: TagOptions[];
  namespace: Namespace;
  parent: UAObject;

  parameters?: object;
};
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
