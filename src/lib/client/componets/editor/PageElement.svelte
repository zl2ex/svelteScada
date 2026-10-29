<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getTagValueMapContext } from "$lib/client/live/tagMapContext";
  import type { EditorMode } from "$lib/client/editor/editorState.svelte";
  import {
    evaluateExpression,
    runEventScript,
    type BindingContext,
    type EventContext,
  } from "$lib/client/editor/elementExpressions";
  import type { AttributeValue, ElementAttributes, ElementRecord } from "$lib/page/elementTypes";
  import {
    containerTypeStyle,
    elementStyleToString,
    isContainerElement,
    isSvgDrawingElement,
    sortedChildren,
  } from "$lib/page/elementTypes";
  import { svgNamespace } from "$lib/page/svgTags";
  import { createEventSnapshot } from "$lib/client/editor/script/eventSnapshot";
  import TagInput from "$lib/client/componets/scada/TagInput.svelte";
  import DeviceStatus from "$lib/client/componets/DeviceStatus.svelte";
  import PageElement from "./PageElement.svelte";
  import PageElementEditWrapper from "./PageElementEditWrapper.svelte";

  type Props = {
    element: ElementRecord;
    elements: Record<string, ElementRecord>;
    propValues?: ElementAttributes;
    insideSvg?: boolean;
    depth?: number;
    mode?: EditorMode;
  };

  type EventActionContext = Omit<EventContext, "event">;

  let { element, elements, propValues = {}, insideSvg = false, depth = 0, mode }: Props = $props();

  const editor = getEditorContext();
  const tagValueMap = getTagValueMapContext();

  let activeMode = $derived(mode ?? editor.mode);
  let children = $derived(sortedChildren(elements, element.id));
  let selected = $derived(activeMode === "edit" && editor.selectedElementId === element.id);

  let bindingContext = $derived<BindingContext>({
    tag: (lookup) => tagValueMap.tag(lookup),
    tagValue: (lookup) => tagValueMap.tagValue(lookup),
    tagStatus: (lookup) => tagValueMap.tagStatus(lookup),
    props: propValues,
    element,
  });

  let eventAction = $derived<{ events: Record<string, string>; context: EventActionContext }>({
    events: activeMode === "preview" ? (element.bindings?.events ?? {}) : {},
    context: {
      ...bindingContext,
      writeTag: (lookup, value) => tagValueMap.writeTag(lookup, value),
    },
  });

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
      const value = toAttributeValue(evaluateExpression(expression, bindingContext));
      if (value === undefined) delete attributes[name];
      else attributes[name] = value;
    }
    return attributes;
  });

  let resolvedStyle = $derived.by(() => {
    const style: Record<string, string> = { ...element.style };
    for (const [property, expression] of Object.entries(element.bindings?.style ?? {})) {
      const value = evaluateExpression(expression, bindingContext);
      if (value === null || value === undefined) delete style[property];
      else style[property] = String(value);
    }
    if (isContainerElement(element)) {
      Object.assign(style, containerTypeStyle(element.containerType));
    }

    return elementStyleToString(style);
  });

  let resolvedProps = $derived.by(() => {
    const props: ElementAttributes = { ...element.attributes };
    for (const [name, expression] of Object.entries(element.bindings?.props ?? {})) {
      const value = toAttributeValue(evaluateExpression(expression, bindingContext));
      console.debug(value);
      if (value === undefined) delete props[name];
      else props[name] = value;
    }
    return props;
  });

  let text = $derived.by(() => {
    const expression = element.bindings?.text;
    if (expression === undefined) return element.text ?? "";
    const value = evaluateExpression(expression, bindingContext);
    return value === null || value === undefined ? "" : String(value);
  });

  let definition = $derived(
    element.kind === "user-component" && element.referencedComponentId
      ? editor.userComponents.find((item) => item.component.id === element.referencedComponentId)
      : undefined,
  );

  function eventScripts(
    node: Element,
    params: { events: Record<string, string>; context: EventActionContext },
  ) {
    let cleanup: Array<() => void> = [];

    const attach = () => {
      for (const remove of cleanup) remove();
      cleanup = [];
      for (const [name, script] of Object.entries(params.events)) {
        if (!name.trim() || !script.trim()) continue;
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
      update(next: { events: Record<string, string>; context: EventActionContext }) {
        params = next;
        attach();
      },
      destroy() {
        for (const remove of cleanup) remove();
        cleanup = [];
      },
    };
  }

  function select(event: MouseEvent) {
    if (activeMode !== "edit") return;
    event.stopPropagation();
    editor.selectedElementId = element.id;
  }

  function selectOnEnter(event: KeyboardEvent) {
    if (activeMode !== "edit") return;
    if (event.key === "Enter") editor.selectedElementId = element.id;
  }

  function selectUserComponent(event: MouseEvent) {
    if (activeMode !== "edit") return;
    event.stopPropagation();
    editor.selectedElementId = element.id;
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
  <div use:eventScripts={eventAction}>
    {#if element.baseComponent === "TagInput"}
      <TagInput {...resolvedAttributes} style={resolvedStyle} />
    {:else if element.baseComponent === "DeviceStatus"}
      <DeviceStatus id="" {...resolvedAttributes} style={resolvedStyle} />
    {:else}
      <span class="text-xs opacity-50">Unknown component: {element.baseComponent}</span>
    {/if}
  </div>
{:else if element.kind === "user-component"}
  {#if definition}
    <div use:eventScripts={eventAction}>
      {#each sortedChildren(definition.elements, null) as child (child.id)}
        <PageElementEditWrapper element={child}>
          <PageElement
            element={child}
            elements={definition.elements}
            propValues={resolvedProps}
            {insideSvg}
            depth={depth + 1}
            mode={activeMode}
          />
        </PageElementEditWrapper>
      {/each}
    </div>
  {:else}
    <span class="text-error-600-400 text-xs">Missing user component.</span>
  {/if}
{:else if element.kind === "svg" && element.tag === "svg"}
  <svg
    class="overflow-visible"
    {...resolvedAttributes}
    style={resolvedStyle}
    use:eventScripts={eventAction}
  >
    {#each children as child (child.id)}
      <PageElementEditWrapper element={child} insideSvg={true}>
        <PageElement
          element={child}
          {elements}
          {propValues}
          insideSvg={true}
          depth={depth + 1}
          mode={activeMode}
        />
      </PageElementEditWrapper>
    {/each}
  </svg>
{:else if element.tag}
  <svelte:element
    this={element.tag}
    {...resolvedAttributes}
    xmlns={element.kind === "svg" ? svgNamespace : undefined}
    style={resolvedStyle}
    use:eventScripts={eventAction}
  >
    {text}
    {#each children as child (child.id)}
      <PageElementEditWrapper element={child}>
        <PageElement
          element={child}
          {elements}
          {propValues}
          {insideSvg}
          depth={depth + 1}
          mode={activeMode}
        />
      </PageElementEditWrapper>
    {/each}
  </svelte:element>
{:else}
  <pre class="text-error-400-600">{JSON.stringify(element, null, 2)}</pre>
{/if}

<style>
  .edit-disable-pointer :global(:is(input, textarea, select, button, a[href])) {
    pointer-events: none;
  }
</style>
