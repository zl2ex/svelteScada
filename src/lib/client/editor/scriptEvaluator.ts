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
  evaluate(expression: string, scope: Record<string, unknown>) {
    return evaluateExpression(expression, scope);
  }

  evaluateElement(expression: string, context: BindingContext) {
    return this.evaluate(expression, context);
  }

  evaluateTag(expression: string, context: TagBindingContext) {
    return this.evaluate(expression, context);
  }

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

  validateScript(script: string) {
    return validateSandboxScript(script);
  }
}

export const scriptEvaluator = new ScriptEvaluator();
