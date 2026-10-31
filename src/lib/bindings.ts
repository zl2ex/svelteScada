import { z } from "zod";

export type BindingExpression = string;
export type BindingExpressionMap = Record<string, BindingExpression>;
export type BindingDefinition = Record<string, BindingExpression | BindingExpressionMap>;

export type Bindings<T extends BindingDefinition> = Partial<T>;

export const z_BindingExpression = z.string();
export const z_BindingExpressionMap = z.record(z.string(), z_BindingExpression);
