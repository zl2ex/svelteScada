import type { TagProperties } from "$lib/sqlite/tagProperties";
import type { TagOptionsInput } from "$lib/server/tag/tag";
import { scriptEvaluator, type TagBindingContext } from "$lib/client/editor/scriptEvaluator";

export type { TagBindingContext };

/**
 * Evaluates a tag binding expression against a tag context.
 *
 * @param expression - Binding expression to evaluate
 * @param context - Tag configuration and properties
 * @returns Ok with the evaluated value, or Err on failure
 */
export function evaluateTagBinding(expression: string, context: TagBindingContext) {
  return scriptEvaluator.evaluateTag(expression, context);
}

/**
 * Resolves all binding expressions for a tag.
 *
 * @param config - Tag configuration whose bindings should be resolved
 * @param [properties] - Tag properties exposed to the bindings (defaults to {})
 * @returns A copy of the tag with resolved binding values applied
 */
export function resolveTagBindings(config: TagOptionsInput, properties: TagProperties = {}) {
  return scriptEvaluator.resolveTagBindings(config, properties);
}

/**
 * Resolves binding expressions for a UDT child tag.
 *
 * @param config - Child tag configuration whose bindings should be resolved
 * @param properties - Tag properties exposed to the bindings
 * @returns A copy of the child tag with resolved binding values applied
 */
export function resolveUdtChildBindings(
  config: TagOptionsInput,
  properties: TagProperties,
): TagOptionsInput {
  return scriptEvaluator.resolveUdtChildBindings(config, properties);
}
