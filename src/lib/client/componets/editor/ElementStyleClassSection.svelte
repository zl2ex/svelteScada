<script lang="ts">
  import { Trash2Icon } from "@lucide/svelte";
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getTagValueMapContext } from "$lib/client/live/tagMapContext";
  import type { BindingContext } from "$lib/client/editor/elementExpressions";
  import { scriptEvaluator } from "$lib/client/editor/scriptEvaluator";
  import { setBinding } from "$lib/client/editor/elementBindingRows";
  import { createElementLookup } from "$lib/client/editor/elementLookup";
  import { extractCssClassNames } from "$lib/themes/css";
  import { neverThrowErrorToString } from "$lib/util/neverThrow";
  import type { ElementRecord } from "$lib/elements/elementTypes";
  import BindingEditor from "./BindingEditor.svelte";
  import Autocomplete from "../Autocomplete.svelte";
  import type { ScriptPropertyKeyInfo } from "$lib/client/editor/propertyKeys";

  let {
    element,
    propertyKeys,
  }: { element: ElementRecord; propertyKeys?: Iterable<ScriptPropertyKeyInfo> } = $props();

  const editor = getEditorContext();
  const tagValueMap = getTagValueMapContext();

  let applied = $derived(element.styleClass ?? []);
  let activeTheme = $derived(editor.activeTheme);
  let available = $derived(
    extractCssClassNames(activeTheme?.projectStyle ?? "").filter((name) => !applied.includes(name)),
  );
  let getElementById = $derived(
    createElementLookup(editor.elementsCollection?.state, editor.userComponents),
  );
  let bindingContext = $derived<BindingContext>({
    tag: (lookup) => tagValueMap.tag(lookup),
    tagValue: (lookup) => tagValueMap.tagValue(lookup),
    tagStatus: (lookup) => tagValueMap.tagStatus(lookup),
    element,
    getElementById,
  });

  /**
   * Returns the stored style-class binding expression for a class name.
   *
   * @param className - Style class name to look up.
   * @returns Binding expression, or an empty string when unbound.
   */
  function bindingFor(className: string) {
    return element.bindings?.styleClass?.[className] ?? "";
  }

  /**
   * Evaluates the style-class binding for a class name.
   *
   * @param className - Style class name to evaluate.
   * @returns Whether the class applies and any evaluation error message.
   */
  function bindingResult(className: string) {
    const expression = bindingFor(className);
    if (!expression.trim()) return { result: false, error: null };
    const evaluation = scriptEvaluator.evaluateElement(expression, bindingContext);
    return evaluation.isErr()
      ? { result: false, error: neverThrowErrorToString(evaluation.error) }
      : { result: Boolean(evaluation.value), error: null };
  }

  /**
   * Replaces the element's applied style classes.
   *
   * @param next - Complete list of style classes to store.
   */
  function updateClasses(next: string[]) {
    editor.elementsCollection?.update(element.id, {
      styleClass: next,
      updatedAt: Date.now(),
    });
  }

  /**
   * Appends a class to the element if it is not already applied.
   *
   * @param className - Style class name to add.
   */
  function addClass(className: string) {
    if (!className || applied.includes(className)) return;
    updateClasses([...applied, className]);
  }

  /**
   * Removes a class and its binding from the element.
   *
   * @param className - Style class name to remove.
   */
  function removeClass(className: string) {
    editor.elementsCollection?.update(element.id, {
      styleClass: applied.filter((name) => name !== className),
      bindings: setBinding(element, "styleClass", className, ""),
      updatedAt: Date.now(),
    });
  }

  /**
   * Saves a style-class binding expression on the element.
   *
   * @param className - Style class name the binding targets.
   * @param expression - Binding expression; an empty string removes it.
   */
  function saveBinding(className: string, expression: string) {
    editor.elementsCollection?.update(element.id, {
      bindings: setBinding(element, "styleClass", className, expression),
      updatedAt: Date.now(),
    });
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center justify-between gap-2">
    <span class="font-semibold opacity-80">Style Classes</span>
    <span class="opacity-40">{applied.length}</span>
  </div>

  <Autocomplete
    items={available}
    placeholder="Search theme classes…"
    onSelect={addClass}
  />

  {#if applied.length === 0}
    <p class="opacity-50">No style classes applied.</p>
  {/if}

  {#each applied as className (className)}
    {@const result = bindingResult(className)}
    <div class="flex flex-col gap-1 rounded border border-surface-200-800 p-1.5">
      <div class="flex items-center gap-1">
        <code
          class="min-w-0 flex-1 bg-primary-100-900 truncate"
          class:bg-surface-300-700={!result.result}
        >
          .{className}
        </code>
        <BindingEditor
          label={className}
          binding={bindingFor(className)}
          savedError={result.error}
          scope="element"
          {propertyKeys}
          onBindingSave={(expression) => saveBinding(className, expression)}
          onBindingRemove={() => saveBinding(className, "")}
        />
        <button
          type="button"
          class="btn-icon btn-sm preset-tonal"
          title={`Remove ${className}`}
          onclick={() => removeClass(className)}
        >
          <Trash2Icon class="size-3.5" />
        </button>
      </div>
    </div>
  {/each}
</div>
