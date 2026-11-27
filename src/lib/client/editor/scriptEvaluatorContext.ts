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

  /**
   * Creates an evaluator bound to the editor's UDT and live tag state.
   *
   * @param options - UDT definitions and live tag values to use
   */
  constructor(options: EditorScriptEvaluatorOptions) {
    this.#udts = options.udts;
    this.#tagValueMap = options.tagValueMap;
  }

  /**
   * Finds the UDT definition matching a tag's data type.
   *
   * @param tag - Tag whose data type names the definition
   * @returns The matching definition, or undefined when none exists
   */
  #definitionFor(tag: TagOptionsInput) {
    return Object.values(this.#udts.state).find((definition) => definition.name === tag.dataType);
  }

  /**
   * Normalizes an unknown value into a tag property map.
   *
   * @param value - Candidate property value
   * @returns The value as a property map, or an empty object
   */
  #propertyMap(value: unknown): TagProperties {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as TagProperties)
      : {};
  }

  /**
   * Merges definition, instance, and override properties for a tag.
   *
   * @param tag - Tag whose effective properties are needed
   * @returns The merged tag properties
   */
  tagProperties(tag: TagOptionsInput): TagProperties {
    return {
      ...(this.#definitionFor(tag)?.properties ?? {}),
      ...this.#propertyMap(tag.properties),
      ...this.#propertyMap(tag.udtOverrides?.properties),
    };
  }

  /**
   * Builds the binding context for a tag.
   *
   * @param tag - Tag to expose to bindings
   * @returns The tag configuration and merged properties
   */
  tagContext(tag: TagOptionsInput) {
    return { tagConfig: tag, properties: this.tagProperties(tag) };
  }

  /**
   * Evaluates a binding expression for a tag.
   *
   * @param tag - Tag providing the binding context
   * @param expression - Binding expression to evaluate
   * @returns Ok with the evaluated value, or Err on failure
   */
  evaluateTagFor(tag: TagOptionsInput, expression: string) {
    return scriptEvaluator.evaluateTag(expression, this.tagContext(tag));
  }

  /**
   * Resolves all binding expressions for a tag.
   *
   * @param tag - Tag configuration whose bindings should be resolved
   * @returns A copy of the tag with resolved binding values applied
   */
  resolveTagConfig(tag: TagOptionsInput) {
    return scriptEvaluator.resolveTagBindings(tag, this.tagProperties(tag));
  }

  /**
   * Builds the binding context for an element, including live tag accessors.
   *
   * @param element - Element to expose to bindings
   * @param [props] - Element properties to expose (defaults to the element's properties)
   * @returns The element binding context
   */
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

  /**
   * Evaluates a binding expression for an element.
   *
   * @param element - Element providing the binding context
   * @param expression - Binding expression to evaluate
   * @param [props] - Element properties to expose (defaults to the element's properties)
   * @returns Ok with the evaluated value, or Err on failure
   */
  evaluateElementFor(
    element: ElementRecord,
    expression: string,
    props: ElementProperties = element.properties ?? {},
  ) {
    return scriptEvaluator.evaluateElement(expression, this.elementContext(element, props));
  }

  /**
   * Finds the first failing binding expression on a tag.
   *
   * @param tag - Tag whose bindings should be checked
   * @returns The first binding error, or null when all bindings succeed
   */
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

  /**
   * Finds the first failing text, attribute, prop, style, class, or event binding on an element.
   *
   * @param element - Element whose bindings should be checked
   * @returns The first binding error, or null when all bindings succeed
   */
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

/**
 * Stores the editor script evaluator in Svelte context.
 *
 * @param evaluator - Evaluator to provide to descendants
 */
export function setScriptEvaluatorContext(evaluator: EditorScriptEvaluator) {
  setContext(scriptEvaluatorKey, evaluator);
}

/**
 * Reads the editor script evaluator from Svelte context.
 *
 * @returns The provided evaluator
 * @throws {Error} when called before a provider sets the evaluator
 */
export function getScriptEvaluatorContext(): EditorScriptEvaluator {
  const evaluator = getContext<EditorScriptEvaluator | undefined>(scriptEvaluatorKey);
  if (!evaluator) throw Error("getScriptEvaluatorContext() called before its provider");
  return evaluator;
}
