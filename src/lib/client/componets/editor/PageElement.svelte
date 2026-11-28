<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getTagValueMapContext } from "$lib/client/live/tagMapContext";
  import type { EditorMode, UserComponentDefinition } from "$lib/client/editor/editorState.svelte";
  import {
    runEventScript,
    type BindingContext,
    type EventContext,
  } from "$lib/client/editor/elementExpressions";
  import { scriptEvaluator } from "$lib/client/editor/scriptEvaluator";
  import type {
    AttributeValue,
    ElementAttributes,
    ElementProperties,
    ElementRecord,
  } from "$lib/elements/elementTypes";
  import type { PropertyValue } from "$lib/propertyValue";
  import {
    elementStyleToString,
    isSvgDrawingElement,
    sortedChildren,
  } from "$lib/elements/elementTypes";
  import { svgNamespace } from "$lib/elements/svgTags";
  import { createEventSnapshot } from "$lib/client/editor/script/eventSnapshot";
  import type { ElementLookup } from "$lib/client/editor/elementLookup";
  import { attempt } from "$lib/util/attempt";
  import TagInput from "$lib/client/componets/scada/TagInput.svelte";
  import DeviceStatus from "$lib/client/componets/DeviceStatus.svelte";
  import PageElement from "./PageElement.svelte";
  import TrendChart from "../scada/TrendChart.svelte";

  type Props = {
    element: ElementRecord;
    elements: Record<string, ElementRecord>;
    getElementById?: ElementLookup;
    insideSvg?: boolean;
    depth?: number;
    mode?: EditorMode;
    userComponents?: UserComponentDefinition[];
  };

  type EventActionContext = Omit<EventContext, "event">;

  let {
    element,
    elements,
    getElementById = () => undefined,
    insideSvg = false,
    depth = 0,
    mode,
    userComponents,
  }: Props = $props();

  const editorResult = attempt(() => getEditorContext());
  const editor = editorResult.isOk ? editorResult.data : undefined;
  const tagValueMap = getTagValueMapContext();

  let activeMode = $derived(mode ?? editor?.mode ?? "preview");
  let componentDefinitions = $derived(userComponents ?? editor?.userComponents ?? []);
  let children = $derived(sortedChildren(elements, element.id));

  let bindingContext = $derived<BindingContext>({
    tag: (lookup) => tagValueMap.tag(lookup),
    tagValue: (lookup) => tagValueMap.tagValue(lookup),
    tagStatus: (lookup) => tagValueMap.tagStatus(lookup),
    element,
    getElementById,
  });

  let eventAction = $derived<{ events: Record<string, string>; context: EventActionContext }>({
    events: activeMode === "preview" ? (element.bindings?.events ?? {}) : {},
    context: {
      ...bindingContext,
      writeTag: (lookup, value) => tagValueMap.writeTag(lookup, value),
    },
  });

  /**
   * Coerces a script result into an attribute value.
   *
   * @param value - Raw value from evaluation.
   * @returns Primitive value as-is, a stringified object, or undefined for null/undefined.
   */
  function toAttributeValue(value: unknown): AttributeValue | undefined {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (value === null || value === undefined) return undefined;
    return String(value);
  }

  let resolvedAttributes = $derived.by(() => {
    const attributes: Record<string, AttributeValue> = { ...element.attributes };
    for (const [name, expression] of Object.entries(element.bindings?.attributes ?? {})) {
      if (name.toLowerCase().startsWith("on")) continue;
      const evaluation = scriptEvaluator.evaluateElement(expression, bindingContext);
      const value = evaluation.isOk() ? toAttributeValue(evaluation.value) : undefined;
      if (value === undefined) delete attributes[name];
      else attributes[name] = value;
    }
    return attributes;
  });

  let styleClassBindings = $derived(element.bindings?.styleClass ?? {});
  let resolvedStyleClasses = $derived.by(() => {
    const classes = element.styleClass ?? [];
    return classes.filter((className) => {
      const expression = styleClassBindings[className];
      if (!expression?.trim()) return true;
      const evaluation = scriptEvaluator.evaluateElement(expression, bindingContext);
      return evaluation.isOk() && Boolean(evaluation.value);
    });
  });

  let resolvedClass = $derived.by(() => {
    const base = resolvedAttributes.class;
    const baseClasses = typeof base === "string" ? base.split(/\s+/) : [];
    const hoverOutline = editor?.mode === "edit" ? "edit-hover-outline" : "";
    return [...baseClasses, ...resolvedStyleClasses, hoverOutline].filter(Boolean).join(" ");
  });

  let resolvedStyle = $derived.by(() => {
    const style: Record<string, string> = { ...element.style };
    for (const [property, expression] of Object.entries(element.bindings?.style ?? {})) {
      const evaluation = scriptEvaluator.evaluateElement(expression, bindingContext);
      const value = evaluation.isOk() ? evaluation.value : undefined;
      if (value === null || value === undefined) delete style[property];
      else style[property] = String(value);
    }
    return elementStyleToString(style);
  });

  let resolvedProps = $derived.by(() => {
    const props: ElementProperties = { ...element.properties };
    for (const [name, expression] of Object.entries(element.bindings?.properties ?? {})) {
      const evaluation = scriptEvaluator.evaluateElement(expression, bindingContext);
      const value = evaluation.isOk() ? toAttributeValue(evaluation.value) : undefined;
      if (value === undefined) delete props[name];
      else {
        const existing = props[name];
        props[name] = existing ? { ...existing, value } : { value, required: true };
      }
    }
    return props;
  });

  let resolvedComponentProps = $derived.by(() => {
    const props: Record<string, AttributeValue> = {};
    for (const [name, property] of Object.entries(resolvedProps)) {
      props[name] = property.value;
    }
    return props;
  });

  let text = $derived.by(() => {
    const expression = element.bindings?.text;
    if (expression === undefined) return element.text ?? "";
    const evaluation = scriptEvaluator.evaluateElement(expression, bindingContext);
    const value = evaluation.isOk() ? evaluation.value : undefined;
    return value === null || value === undefined ? "" : String(value);
  });

  let definition = $derived(
    element.kind === "user-component" && element.referencedComponentId
      ? componentDefinitions.find((item) => item.component.id === element.referencedComponentId)
      : undefined,
  );

  /**
   * Attaches preview event scripts to a DOM node and returns lifecycle controls.
   *
   * @param node - DOM element receiving the native event listeners.
   * @param params - Event scripts and execution context.
   * @returns An object with update and destroy lifecycle methods.
   */
  function eventScripts(
    node: Element,
    params: { events: Record<string, string>; context: EventActionContext },
  ) {
    let cleanup: Array<() => void> = [];

    /**
     * Replaces all attached listeners with those from the current params.
     */
    const attach = () => {
      for (const remove of cleanup) remove();
      cleanup = [];
      for (const [name, script] of Object.entries(params.events)) {
        if (!name.trim() || !script.trim()) continue;
        /**
         * Runs an event script for a single native event.
         *
         * @param event - Native event to snapshot and pass to the script.
         */
        const handler = (event: Event) => {
          void runEventScript(script, {
            ...params.context,
            event: createEventSnapshot(event),
          });
        };
        node.addEventListener(name, handler);
        cleanup.push(() => node.removeEventListener(name, handler));
      }
    };

    attach();

    return {
      /**
       * Updates the event parameters and reattaches listeners.
       *
       * @param next - Replacement event scripts and context.
       */
      update(next: { events: Record<string, string>; context: EventActionContext }) {
        params = next;
        attach();
      },
      /**
       * Removes all attached event listeners.
       */
      destroy() {
        for (const remove of cleanup) remove();
        cleanup = [];
      },
    };
  }
</script>

{#if depth > 24}
  <p class="text-error-600-400 text-xs">Component recursion limit reached.</p>
{:else if insideSvg && element.kind !== "svg"}
  <p class="text-error-600-400 text-xs">Only SVG elements may be inside an svg container.</p>
{:else if isSvgDrawingElement(element) && !insideSvg}
  <p class="text-error-600-400 text-xs">
    SVG element {element.tag} must be inside an svg container.
  </p>
{:else if element.kind === "base-component"}
  <div data-element-id={element.id} use:eventScripts={eventAction}>
    {#if element.baseComponent === "TagInput"}
      <TagInput {...resolvedComponentProps} class={resolvedClass} style={resolvedStyle} />
    {:else if element.baseComponent === "DeviceStatus"}
      <DeviceStatus id="" {...resolvedComponentProps} class={resolvedClass} style={resolvedStyle} />
    {:else if element.baseComponent === "TrendChart"}
      <TrendChart
        id={element.id}
        {...resolvedComponentProps}
        class={resolvedClass}
        style={resolvedStyle}
      />
    {:else}
      <span class="text-xs opacity-50">
        Unknown component: {element.baseComponent satisfies null}
      </span>
    {/if}
  </div>
{:else if element.kind === "user-component"}
  {#if definition}
    <div class={resolvedClass} data-element-id={element.id} use:eventScripts={eventAction}>
      {#each sortedChildren(definition.elements, null) as child (child.id)}
        <PageElement
          element={child}
          elements={definition.elements}
          {getElementById}
          {insideSvg}
          depth={depth + 1}
          mode={activeMode}
          userComponents={componentDefinitions}
        />
      {/each}
    </div>
  {:else}
    <span class="text-error-600-400 text-xs">Missing user component.</span>
  {/if}
{:else if element.kind === "svg" && element.tag === "svg"}
  <svg
    {...resolvedAttributes}
    data-element-id={element.id}
    class={`overflow-visible ${resolvedClass}`}
    style={resolvedStyle}
    use:eventScripts={eventAction}
  >
    {#each children as child (child.id)}
      <PageElement
        element={child}
        {elements}
        {getElementById}
        insideSvg={true}
        depth={depth + 1}
        mode={activeMode}
        userComponents={componentDefinitions}
      />
    {/each}
  </svg>
{:else if element.tag}
  <svelte:element
    this={element.tag}
    {...resolvedAttributes}
    data-element-id={element.id}
    class={resolvedClass}
    xmlns={element.kind === "svg" ? svgNamespace : undefined}
    style={resolvedStyle}
    use:eventScripts={eventAction}
  >
    {text}
    {#each children as child (child.id)}
      <PageElement
        element={child}
        {elements}
        {getElementById}
        {insideSvg}
        depth={depth + 1}
        mode={activeMode}
        userComponents={componentDefinitions}
      />
    {/each}
  </svelte:element>
{:else}
  <pre class="text-error-400-600">{JSON.stringify(element, null, 2)}</pre>
{/if}

<style>
  .edit-hover-outline:hover:not(:has(:hover)) {
    outline: 0.01rem solid var(--custom-moveable-color);
    outline-offset: -0.005rem;
  }
</style>
