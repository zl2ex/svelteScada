import { getContext, setContext } from "svelte";
import type { TagValueMap } from "$lib/client/live/tagMap.svelte";
import type { TagOptionsInput } from "$lib/server/tag/tag";
import type { TagProperties } from "$lib/sqlite/tagProperties";
import type { ElementProperties, ElementRecord } from "$lib/elements/elementTypes";
import type { UdtDefinitionCollection } from "$lib/client/editor/udtDefinitionContext";
import { getBindingMap } from "$lib/client/editor/elementBindingRows";
import { tagBindingKeys } from "$lib/tagBindings";
import { scriptEvaluator } from "$lib/client/editor/scriptEvaluator";
import { neverThrowErrorToString } from "$lib/util/neverThrow";
import type { BindingContext } from "$lib/client/editor/elementExpressions";

export type ScriptBindingError = {
  scope: string;
  key?: string;
  message: string;
};

type EditorScriptEvaluatorOptions = {
  udts: UdtDefinitionCollection;
  tagValueMap: TagValueMap;
};

export class EditorScriptEvaluator {
  #udts: UdtDefinitionCollection;
  #tagValueMap: TagValueMap;

  constructor(options: EditorScriptEvaluatorOptions) {
    this.#udts = options.udts;
    this.#tagValueMap = options.tagValueMap;
  }

  #definitionFor(tag: TagOptionsInput) {
    return Object.values(this.#udts.state).find((definition) => definition.name === tag.dataType);
  }

  #propertyMap(value: unknown): TagProperties {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as TagProperties)
      : {};
  }

  tagProperties(tag: TagOptionsInput): TagProperties {
    return {
      ...(this.#definitionFor(tag)?.properties ?? {}),
      ...this.#propertyMap(tag.properties),
      ...this.#propertyMap(tag.udtOverrides?.properties),
    };
  }

  tagContext(tag: TagOptionsInput) {
    return { tagConfig: tag, properties: this.tagProperties(tag) };
  }

  evaluateTagFor(tag: TagOptionsInput, expression: string) {
    return scriptEvaluator.evaluateTag(expression, this.tagContext(tag));
  }

  resolveTagConfig(tag: TagOptionsInput) {
    return scriptEvaluator.resolveTagBindings(tag, this.tagProperties(tag));
  }

  elementContext(
    element: ElementRecord,
    props: ElementProperties = element.properties ?? {},
  ): BindingContext {
    return {
      tag: (lookup: string) => this.#tagValueMap.tag(lookup),
      tagValue: (lookup: string) => this.#tagValueMap.tagValue(lookup),
      tagStatus: (lookup: string) => this.#tagValueMap.tagStatus(lookup),
      props,
      element,
    };
  }

  evaluateElementFor(
    element: ElementRecord,
    expression: string,
    props: ElementProperties = element.properties ?? {},
  ) {
    return scriptEvaluator.evaluateElement(expression, this.elementContext(element, props));
  }

  tagError(tag: TagOptionsInput): ScriptBindingError | null {
    const context = this.tagContext(tag);
    const bindings = { ...(tag.bindings ?? {}), ...(tag.udtOverrides?.bindings ?? {}) };

    for (const key of tagBindingKeys) {
      const expression = bindings[key];
      if (!expression?.trim()) continue;

      const evaluation = scriptEvaluator.evaluateTag(expression, context);
      if (evaluation.isErr()) {
        return {
          scope: "bindings",
          key,
          message: neverThrowErrorToString(evaluation.error),
        };
      }
    }

    return null;
  }

  elementError(element: ElementRecord): ScriptBindingError | null {
    const context = this.elementContext(element);
    const bindings = element.bindings;

    if (bindings?.text?.trim()) {
      const evaluation = scriptEvaluator.evaluateElement(bindings.text, context);
      if (evaluation.isErr()) {
        return {
          scope: "text",
          message: neverThrowErrorToString(evaluation.error),
        };
      }
    }

    for (const scope of ["attributes", "props", "style", "styleClass"] as const) {
      const expressions = getBindingMap(element, scope);
      for (const [key, expression] of Object.entries(expressions)) {
        if (!expression.trim()) continue;

        const evaluation = scriptEvaluator.evaluateElement(expression, context);
        if (evaluation.isErr()) {
          return {
            scope,
            key,
            message: neverThrowErrorToString(evaluation.error),
          };
        }
      }
    }

    for (const [key, script] of Object.entries(bindings?.events ?? {})) {
      if (!script.trim()) continue;

      const evaluation = scriptEvaluator.validateScript(script);
      if (evaluation.isErr()) {
        return {
          scope: "events",
          key,
          message: neverThrowErrorToString(evaluation.error),
        };
      }
    }

    return null;
  }
}

const scriptEvaluatorKey = Symbol("script-evaluator");

export function setScriptEvaluatorContext(evaluator: EditorScriptEvaluator) {
  setContext(scriptEvaluatorKey, evaluator);
}

export function getScriptEvaluatorContext(): EditorScriptEvaluator {
  const evaluator = getContext<EditorScriptEvaluator | undefined>(scriptEvaluatorKey);
  if (!evaluator) throw Error("getScriptEvaluatorContext() called before its provider");
  return evaluator;
}
