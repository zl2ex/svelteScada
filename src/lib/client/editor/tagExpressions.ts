import type { TagProperties } from "$lib/sqlite/tagProperties";
import type { TagOptionsInput } from "$lib/server/tag/tag";
import { tagBindingKeys } from "$lib/tagBindings";
import { evaluateExpression } from "$lib/client/editor/expressions";

export type TagBindingContext = {
  tagConfig: TagOptionsInput;
  properties: TagProperties;
};

export function evaluateTagBinding(expression: string, context: TagBindingContext) {
  return evaluateExpression(expression, context);
}

export function resolveTagBindings(config: TagOptionsInput, properties: TagProperties = {}) {
  const resolved = { ...config };
  const bindingContext = { tagConfig: config, properties };

  for (const key of tagBindingKeys) {
    const expression = config.bindings?.[key];
    if (!expression?.trim()) continue;

    const evaluation = evaluateTagBinding(expression, bindingContext);
    if (evaluation.isOk() && evaluation.value !== undefined) {
      Object.assign(resolved, { [key]: evaluation.value });
    }
  }

  return resolved;
}

export function resolveUdtChildBindings(
  config: TagOptionsInput,
  properties: TagProperties,
): TagOptionsInput {
  const resolved = { ...config };

  for (const key of tagBindingKeys) {
    const expression = config.bindings?.[key];
    if (!expression?.trim()) continue;

    const evaluation = evaluateTagBinding(expression, { tagConfig: config, properties });
    if (evaluation.isOk() && evaluation.value !== undefined) {
      Object.assign(resolved, { [key]: evaluation.value });
    }
  }

  return resolved;
}
