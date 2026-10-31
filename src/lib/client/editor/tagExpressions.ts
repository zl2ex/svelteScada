import type { TagOptionsInput } from "$lib/server/tag/tag";
import { tagBindingKeys } from "$lib/tagBindings";
import { evaluateExpression } from "$lib/client/editor/expressions";

export type TagBindingContext = {
  tagConfig: TagOptionsInput;
};

export function evaluateTagBinding(expression: string, context: TagBindingContext) {
  return evaluateExpression(expression, context);
}

export function resolveTagBindings(config: TagOptionsInput) {
  const resolved = { ...config };
  const bindingContext = { tagConfig: config };

  for (const key of tagBindingKeys) {
    const expression = config.bindings?.[key];
    if (!expression?.trim()) continue;

    const value = evaluateTagBinding(expression, bindingContext);
    if (value !== undefined) Object.assign(resolved, { [key]: value });
  }

  return resolved;
}
