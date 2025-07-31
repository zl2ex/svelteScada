
import { logger } from "../../pino/logger";
import { type UAVariable, DataType, Variant, type Namespace, StatusCodes, type UAObject, VariantArrayType, type DateTime, type Guid, type Double, type SByte, type Byte, type Int16, type UInt16, type Int32, type UInt32, type Int64, type UInt64, type Float, type ByteString} from "node-opcua";

type emitPayload = {
  nodeId: string;
  value: any;
}

export type TagOptions = {
  name: string;
  nodeId: string;
  dataType: string;
  writable?: boolean;
  initialValue?: any;
  onUpdate?: (value: any) => void;
  emit?: (event: string, payload: emitPayload) => void;
};


/*type DataTypeMap<T extends string> = {
  T extends "Null" ? null :
  T extends "Boolean" ? boolean :
  T extends "SByte" | "Byte" ? number :
  T extends "Int16" | "UInt16" | "Int32" | "UInt32" | "Int64" | "UInt64" | "Float" | "Double" ? number :
  T extends "String" ? string :
  T extends "DateTime" ? Date :
  never;
  /*  T extends "Guid = 14,
    T extends "ByteString = 15,
    T extends "XmlElement = 16,
    T extends "NodeId = 17,
    T extends "ExpandedNodeId = 18,
    T extends "StatusCode = 19,
    T extends "QualifiedName = 20,
    T extends "LocalizedText = 21,
    T extends "ExtensionObject = 22,
    T extends "DataValue = 23,
    T extends "Variant = 24,
    T extends "DiagnosticInfo = 25
};*/

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

type TupleOf<T, N extends number, R extends T[] = []> =
  R['length'] extends N ? R : TupleOf<T, N, [...R, T]>;

type ParseSize<Size extends string> =
  Size extends "" ? "var" :
  Size extends `${infer N extends number}` ? N :
  never;

type ParseType<T extends string> =
  // Handle arrays with or without size, e.g., "Double[2]", "Double[]"
  T extends `${infer Base}[${infer Size}]`
    ? Base extends keyof OpcuaDataTypeMapping
      ? ParseSize<Size> extends "var"
        ? OpcuaDataTypeMapping[Base][]
        : number extends ParseSize<Size>
          ? OpcuaDataTypeMapping[Base][]
          : TupleOf<OpcuaDataTypeMapping[Base], ParseSize<Size>>
      : never
    // Handle scalar types
    : T extends keyof OpcuaDataTypeMapping
      ? OpcuaDataTypeMapping[T]
      : never;

function decodeDataType(dataType: string) {
  let opcuaDataType: DataType; 
  const arrayMatch = dataType.match(/^(\w+)\[(\d*)\]$/);
  let isArray = !!arrayMatch || dataType.endsWith("[]"); // handles arrays of an unkown size
  let arrayLength = arrayMatch ? parseInt(arrayMatch[2], 10) : undefined;

    // type without array size or brackets
    const baseDataType = arrayMatch ? arrayMatch[1] : dataType.replace("[]", "");
    // is a opcua datatype
    if(Object.values(DataType).includes(baseDataType as unknown as DataType)) {
      opcuaDataType = baseDataType as unknown as DataType;
    }
    // is a user defined datatype and therfore a opcua ExtentionObject
    else {
      opcuaDataType = DataType.ExtensionObject;
    }

  if(isArray == false) {
    return typeof Array.of(0);
  }
}

export class Tag {
  name: string;
  nodeId: string;
  dataType: string;
  opcuaDataType: DataType;
  isArray: boolean;
  arrayLength: number | undefined;
  writable: boolean
  value: any;
  variable?: UAVariable;
  onUpdate?: (value: any) => void;
  emit?: (event: string, payload: emitPayload) => void;

  constructor(opts: TagOptions, namespace: Namespace, parent: UAObject) {
    this.name = opts.name;
    this.nodeId = opts.nodeId ?? `ns=1;s=${opts.name}`;
    this.dataType = opts.dataType;

    this.writable = opts.writable ?? false;
    
    this.onUpdate = opts.onUpdate;
    this.emit = opts.emit;

    // pull out the base datatype and the array size if an array is defined
    // eg input Double[2]  =>   ["Double[2], "Double", 2]
    const arrayMatch = opts.dataType.match(/^(\w+)\[(\d*)\]$/);
    this.isArray = !!arrayMatch || opts.dataType.endsWith("[]"); // handles arrays of an unkown size
    this.arrayLength = arrayMatch ? parseInt(arrayMatch[2], 10) : undefined;

    // type without array size or brackets
    const baseDataType = arrayMatch ? arrayMatch[1] : opts.dataType.replace("[]", "");
    // is a opcua datatype
    if(Object.values(DataType).includes(baseDataType as unknown as DataType)) {
      this.opcuaDataType = baseDataType as unknown as DataType;
    }
    // is a user defined datatype and therfore a opcua ExtentionObject
    else {
      this.opcuaDataType = DataType.ExtensionObject;
    }

    // fill array with values based on length if not provided in inital value
    if (this.isArray && this.arrayLength !== undefined && !Array.isArray(opts?.initialValue)) {
      this.value = Array(this.arrayLength).fill(0);
    }
    // check if the correct length array was supplied in the initalValue
    else if (this.isArray && opts.initialValue?.length == this.arrayLength) {
      this.value = opts.initialValue;
    }
    else if(this.isArray == false && opts.initialValue !== undefined) {
      this.value == opts.initialValue;
    }
    else {
      throw new Error("Inital value Error - " + opts.initialValue + " was not provided or is the wrong type for tag " + this.nodeId + " expected type " + this.dataType);
    }

    this.variable = namespace.addVariable({
      componentOf: parent,
      browseName: this.name,
      nodeId: this.nodeId,
      dataType: this.opcuaDataType,
      valueRank: this.arrayLength ? 1 : 0,
      arrayDimensions: this.arrayLength ? [this.arrayLength] : null,
      value: {
        get: () => new Variant({ 
          dataType: this.opcuaDataType, 
          arrayType: this.isArray ? VariantArrayType.Array : undefined,
          value: this.value
        }),
        set: (variant: Variant) => {
          if (this.isArray && variant.value.length !== this.arrayLength) {
            return { statusCode: StatusCodes.BadOutOfRange };
          }
          this.value = variant.value;
          this.triggerEmit();
          return { statusCode: StatusCodes.Good };
        }
      }
    });

    this.variable.on("value_changed", (dataValue) => {
      if(this.isArray) {
        this.value = Array.from(dataValue.value.value);
      }
      else {
        this.value = dataValue.value.value;
      }
      this.triggerEmit();
    });
  }

  update(newValue: any) {
    if(this.isArray !== Array.isArray(newValue)) throw new TypeError("Array Type Error - Value " + newValue + " is not assignable to tag " + this.nodeId + " expected type " + this.dataType);
    if(this.isArray && this.arrayLength !== newValue?.length) throw new TypeError("Array Size Error - Value " + newValue + " is not assignable to tag " + this.nodeId  + " expected type " + this.dataType + " -  provided length " + newValue.length + "  expected length " + this.arrayLength);
    //if(typeof newValue !== typeof this.dataType) throw new Error("Value " + newValue + " is not assignable to tag " + this.nodeId  + " expected type " + this.dataType);
    console.log(typeof newValue);
    console.log(this.dataType);
    this.value = newValue;
    this.variable?.setValueFromSource({
      dataType: this.opcuaDataType,
      arrayType: this.isArray ? VariantArrayType.Array : undefined,
      //dimensions: this.isArray && this.arrayLength ? [this.arrayLength] : undefined,
      value: newValue
    });
    //this._triggerUpdate();
  }

  triggerEmit() {
    this.onUpdate?.(this.value);
    this.emit?.("tag:update", { nodeId: this.nodeId, value: this });
  }
}
