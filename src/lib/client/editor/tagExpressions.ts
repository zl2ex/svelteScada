import type { TagProperties } from "$lib/sqlite/tagProperties";
import type { TagOptionsInput } from "$lib/server/tag/tag";
import { scriptEvaluator, type TagBindingContext } from "$lib/client/editor/scriptEvaluator";

export type { TagBindingContext };

export function evaluateTagBinding(expression: string, context: TagBindingContext) {
  return scriptEvaluator.evaluateTag(expression, context);
}

export function resolveTagBindings(config: TagOptionsInput, properties: TagProperties = {}) {
  return scriptEvaluator.resolveTagBindings(config, properties);
}

export function resolveUdtChildBindings(
  config: TagOptionsInput,
  properties: TagProperties,
): TagOptionsInput {
  return scriptEvaluator.resolveUdtChildBindings(config, properties);
}
