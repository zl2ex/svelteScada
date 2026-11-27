import type { TagOptionsInput } from "$lib/server/tag/tag";
import type { TagProperties } from "$lib/sqlite/tagProperties";
import { tagBindingKeys } from "$lib/tagBindings";
import type { BindingContext } from "$lib/client/editor/elementExpressions";
import { evaluateExpression } from "$lib/client/editor/expressions";
import { validateSandboxScript } from "$lib/client/editor/script/scriptSandbox";

export type TagBindingContext = {
  tagConfig: TagOptionsInput;
  properties: TagProperties;
};

class ScriptEvaluator {
  /**
   * Evaluates an expression against a raw scope.
   *
   * @param expression - Binding expression to evaluate
   * @param scope - Values exposed to the expression
   * @returns Ok with the evaluated value, or Err on failure
   */
  evaluate(expression: string, scope: Record<string, unknown>) {
    return evaluateExpression(expression, scope);
  }

  /**
   * Evaluates an expression against an element binding context.
   *
   * @param expression - Binding expression to evaluate
   * @param context - Element binding context
   * @returns Ok with the evaluated value, or Err on failure
   */
  evaluateElement(expression: string, context: BindingContext) {
    return this.evaluate(expression, context);
  }

  /**
   * Evaluates an expression against a tag binding context.
   *
   * @param expression - Binding expression to evaluate
   * @param context - Tag configuration and properties
   * @returns Ok with the evaluated value, or Err on failure
   */
  evaluateTag(expression: string, context: TagBindingContext) {
    return this.evaluate(expression, context);
  }

  /**
   * Resolves tag binding expressions into concrete field values.
   *
   * @param config - Tag configuration whose bindings should be resolved
   * @param [properties] - Tag properties exposed to the bindings (defaults to {})
   * @returns A copy of the configuration with resolved binding values applied
   */
  resolveTagBindings(config: TagOptionsInput, properties: TagProperties = {}) {
    const resolved = { ...config };
    const bindingContext = { tagConfig: config, properties };

    for (const key of tagBindingKeys) {
      const expression = config.bindings?.[key];
      if (!expression?.trim()) continue;

      const evaluation = this.evaluateTag(expression, bindingContext);
      if (evaluation.isOk() && evaluation.value !== undefined) {
        Object.assign(resolved, { [key]: evaluation.value });
      }
    }

    return resolved;
  }

  /**
   * Resolves binding expressions for a UDT child tag.
   *
   * @param config - Child tag configuration whose bindings should be resolved
   * @param properties - Tag properties exposed to the bindings
   * @returns A copy of the configuration with resolved binding values applied
   */
  resolveUdtChildBindings(config: TagOptionsInput, properties: TagProperties) {
    const resolved = { ...config };

    for (const key of tagBindingKeys) {
      const expression = config.bindings?.[key];
      if (!expression?.trim()) continue;

      const evaluation = this.evaluateTag(expression, { tagConfig: config, properties });
      if (evaluation.isOk() && evaluation.value !== undefined) {
        Object.assign(resolved, { [key]: evaluation.value });
      }
    }

    return resolved;
  }

  /**
   * Validates that an event script compiles.
   *
   * @param script - Event script source to validate
   * @returns Ok when the script compiles, or Err with a compile failure
   */
  validateScript(script: string) {
    return validateSandboxScript(script);
  }
}

export const scriptEvaluator = new ScriptEvaluator();
