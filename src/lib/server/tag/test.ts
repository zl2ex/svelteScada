/*import { z } from "zod";

const baseZodSchemas = {
  Double: z.number(),
  Int32: z.number().int(),
  Boolean: z.boolean(),
  String: z.string(),
  SensorUDT: z.object({
    faulted: z.boolean(),
    value: z.number(),
  }),
} as const;

export type BaseTypeMap = {
  [K in keyof typeof baseZodSchemas]: z.infer<(typeof baseZodSchemas)[K]>;
};

type ParseArray<DataType extends string> =
  DataType extends `${infer Base}[${infer Len}]`
    ? Len extends `${number}`
      ? { base: Base; length: Len }
      : { base: Base; length: "dynamic" }
    : { base: DataType; length: null };

type BuildTuple<
  T,
  N extends number,
  R extends unknown[] = [],
> = R["length"] extends N ? R : BuildTuple<T, N, [...R, T]>;

type ResolveType<DataType extends string> =
  ParseArray<DataType> extends { base: infer B; length: infer L }
    ? B extends keyof BaseTypeMap
      ? L extends "dynamic"
        ? BaseTypeMap[B][]
        : L extends `${infer N extends number}`
          ? BuildTuple<BaseTypeMap[B], N>
          : BaseTypeMap[B]
      : never
    : never;

function getSchema<DataType extends string>(dataType: DataType): z.ZodTypeAny {
  const parsed = dataType.match(/^(?<base>[A-Za-z]+)(?:\[(?<len>\d*?)\])?$/);
  if (!parsed?.groups) throw new Error(`Invalid dataType: ${dataType}`);
  const base = parsed.groups.base;
  const len = parsed.groups.len;

  const baseSchema = (baseZodSchemas as any)[base];
  if (!baseSchema) throw new Error(`Unknown base type: ${base}`);

  if (len === undefined) {
    return baseSchema; // scalar
  }
  if (len === "") {
    return z.array(baseSchema); // dynamic []
  }
  return z.array(baseSchema).length(Number(len)); // fixed tuple length
}

export class Tag<DataType extends string> {
  private _value: ResolveType<DataType>;
  readonly name: string;
  readonly dataType: DataType;
  private schema: z.ZodTypeAny;

  constructor(opts: {
    name: string;
    dataType: DataType;
    value: ResolveType<DataType>;
  }) {
    this.name = opts.name;
    this.dataType = opts.dataType;
    this.schema = getSchema(this.dataType);
    this._value = this.validate(opts.value);
  }

  private validate(value: unknown): ResolveType<DataType> {
    return this.schema.parse(value);
  }

  get value() {
    return this._value;
  }

  update(newValue: ResolveType<DataType>) {
    this._value = this.validate(newValue);
  }
}

// ✅ Scalar
const t1 = new Tag({
  name: "temperature",
  dataType: "Double",
  value: 42.5,
});

// ✅ Dynamic array
const t2 = new Tag({
  name: "samples",
  dataType: "Double[]",
  value: [1.1, 2.2, 3.3],
});

// ✅ Fixed array
const t3 = new Tag({
  name: "fixed",
  dataType: "Double[3]",
  value: [1.1, 2.2, 3.3],
});

// ❌ Compile error: wrong tuple length
// t3.update([1.1, 2.2]);

// ❌ Runtime error: wrong type
// t3.update([1.1, "oops", 3.3]);

// ✅ UDT
const t4 = new Tag({
  name: "sensor",
  dataType: "SensorUDT",
  value: { faulted: false, value: 123.4 },
});
*/

import { z } from "zod";

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

// Parse "Double[3]" or "SensorUDT[]" into base + length
type ParseArray<DataType extends string> =
  DataType extends `${infer Base}[${infer Len}]`
    ? Len extends `${number}`
      ? { base: Base; length: Len }
      : { base: Base; length: "dynamic" }
    : { base: DataType; length: null };

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

export class Tag<DataType extends string> {
  private _value: ResolveType<DataType>;
  readonly name: string;
  readonly dataType: DataType;
  private schema: z.ZodTypeAny;

  constructor(opts: {
    name: string;
    dataType: DataType;
    value: ResolveType<DataType>;
  }) {
    this.name = opts.name;
    this.dataType = opts.dataType;
    this.schema = getSchema(this.dataType);
    this._value = this.validate(opts.value);
  }

  private validate(value: unknown): ResolveType<DataType> {
    return this.schema.parse(value);
  }

  get value() {
    return this._value;
  }

  update(newValue: ResolveType<DataType>) {
    this._value = this.validate(newValue);
  }
}

// Scalar
const t1 = new Tag({ name: "temperature", dataType: "Double", value: 42.5 });

// Dynamic array
const t2 = new Tag({
  name: "samples",
  dataType: "Double[]",
  value: [1.1, 2.2, 3.3],
});

// Fixed-length array
const t3 = new Tag({ name: "vector", dataType: "Double[3]", value: [1, 2, 3] });

// UDT
const t4 = new Tag({
  name: "sensor",
  dataType: "SensorUDT",
  value: { faulted: false, value: 123.4 },
});

// Array of UDTs (dynamic)
const t5 = new Tag({
  name: "sensorArray",
  dataType: "SensorUDT[]",
  value: [
    { faulted: false, value: 1 },
    { faulted: true, value: 2 },
  ],
});

// Array of UDTs (fixed-length tuple)
const t6 = new Tag({
  name: "sensorTuple",
  dataType: "SensorUDT[2]",
  value: [
    { faulted: false, value: 1 },
    { faulted: true, value: 2 },
  ],
});

const tags = new Map();

tags.set("/demo/test", t6);

tags.get("/demo/test").update();
// ❌ Compile-time error: wrong number of elements
// t6.update([{ faulted: false, value: 1 }]);

// ❌ Runtime error: wrong type
// t5.update([{ faulted: false, value: "oops" }]);
