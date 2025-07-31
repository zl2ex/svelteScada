
import type { Namespace, UAObject } from "node-opcua";
import { logger } from "../../../lib/pino/logger";
import { Tag, type TagOptions } from "./tag";
import jsonUdt from "./udt.json";


type PrimitiveMap = {
  Double: number;
  Int32: number;
  Float: number;
  Boolean: boolean;
  String: string;
  // Add other mappings as needed
};

type ConvertJsonToType<T extends Record<string, string>> = {
  [K in keyof T]: T[K] extends keyof PrimitiveMap ? PrimitiveMap[T[K]] : unknown;
};

export interface UdtDefinitionOptions extends TagOptions {
  parameters?: any;
};

export interface UdtTagOptions extends TagOptions {
  parameters?: any;
};

export class UdtDefinition extends Tag {
  constructor(opts: UdtDefinitionOptions) {

    super(opts);
    const schema = Object.keys(jsonUdt).includes(this.dataType) ? jsonUdt[this.dataType] : logger.error(this.dataType + " Doest not exist in udt.json");
    console.log(schema);
    //this.buildFields(this.nodeId, schema, opts.initialValue)
  }

};

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
    }*/
  }

  return fields;
}

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


    const udtDefinition = jsonUdt[this.dataType];
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
