<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import type { ElementRecord } from "$lib/elements/elementTypes";
  import { tick, type Snippet } from "svelte";
  import { attempt } from "$lib/util/attempt";
  import { svgNamespace } from "$lib/elements/svgTags";

  type Props = {
    children: Snippet;
    element: ElementRecord;
    insideSvg?: boolean;
  };

  let { children, element, insideSvg }: Props = $props();

  const editorContext = attempt(() => getEditorContext());
  const editor = editorContext.isOk ? editorContext.data : undefined;

  // default to preview or normal render if no editor context is found
  let activeMode = $derived(editor?.mode ?? "preview");
  let isSelected = $derived(
    activeMode === "edit" && editor?.selectedElementIds.includes(element.id),
  );

  function select(event: MouseEvent) {
    if (!editor) return;
    if (activeMode !== "edit") return;
    event.stopPropagation();
    editor.selectElement(element.id, {
      additive: event.ctrlKey || event.metaKey,
      range: event.shiftKey,
    });
  }

  function selectOnEnter(event: KeyboardEvent) {
    if (!editor) return;
    if (activeMode !== "edit") return;
    if (event.key === "Enter") {
      editor.selectElement(element.id, {
        additive: event.ctrlKey || event.metaKey,
      });
    }
  }
  let coords = $state({ top: 0, left: 0, width: 0, height: 0 });

  // The outline is positioned with fixed viewport coordinates, so it must live
  // outside transformed/positioned canvas ancestors.
  function teleport(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  // Action to monitor the size and position of children
  function trackBounds(node: HTMLElement | SVGGElement) {
    let resizeObserver: ResizeObserver;

    function update() {
      if (!isSelected) return;

      const childElements = Array.from(node.children);
      if (childElements.length === 0) return;

      let minX = Infinity,
        minY = Infinity;
      let maxX = -Infinity,
        maxY = -Infinity;

      childElements.forEach((child) => {
        const rect = child.getBoundingClientRect();
        // Skip elements with no physical dimensions
        if (rect.width === 0 && rect.height === 0) return;

        minX = Math.min(minX, rect.left);
        minY = Math.min(minY, rect.top);
        maxX = Math.max(maxX, rect.right);
        maxY = Math.max(maxY, rect.bottom);
      });

      if (minX === Infinity) return;

      coords = {
        top: minY,
        left: minX,
        width: maxX - minX,
        height: maxY - minY,
      };
    }

    // Update whenever things shift or resize
    if (typeof window !== "undefined") {
      resizeObserver = new ResizeObserver(update);
      Array.from(node.children).forEach((c) => resizeObserver.observe(c));
      window.addEventListener("resize", update);
      // Capture scroll from the internally scrolling canvas as well as window.
      window.addEventListener("scroll", update, true);
    }

    // Re-run calculation if props change
    $effect(() => {
      if (isSelected) {
        tick().then(update);
      }
    });

    return {
      destroy() {
        if (resizeObserver) resizeObserver.disconnect();
        if (typeof window !== "undefined") {
          window.removeEventListener("resize", update);
          window.removeEventListener("scroll", update, true);
        }
      },
    };
  }
</script>

{#if insideSvg}
  <g role="presentation" use:trackBounds onclick={select} onkeydown={selectOnEnter}>
    {@render children?.()}
  </g>
{:else}
  <div
    class="contents"
    role="presentation"
    use:trackBounds
    onclick={select}
    onkeydown={selectOnEnter}
  >
    {@render children?.()}
  </div>
{/if}
<!-- Teleport the border out to the body so it never clashes with SVG/Z-index scopes -->
{#if isSelected && coords.width > 0}
  <div
    class="edit-selection-outline"
    use:teleport
    style:top="{coords.top}px"
    style:left="{coords.left}px"
    style:width="{coords.width}px"
    style:height="{coords.height}px"
  ></div>
{/if}
{#if false}
  {#if activeMode === "edit"}
    {#if insideSvg}
      <g
        role="presentation"
        onclick={select}
        onkeydown={selectOnEnter}
        class:edit-disable-pointer={activeMode === "edit"}
        class:outline-2={isSelected}
        class:outline-primary-500={isSelected}
        class:-outline-offset-2={isSelected}
      >
        {@render children?.()}
        {#if isSelected && false}
          <rect
            xmlns={svgNamespace}
            width="6"
            height="6"
            x="-3"
            y="-3"
            class="stroke-primary-500 stroke-2"
          ></rect>

          <rect
            xmlns={svgNamespace}
            width="6"
            height="6"
            x="-3"
            y="100%"
            class="stroke-primary-500 stroke-2"
          ></rect>
          <rect
            xmlns={svgNamespace}
            width="6"
            height="6"
            x="100%"
            y="100%"
            class="stroke-primary-500 stroke-2"
          ></rect>
          <rect
            xmlns={svgNamespace}
            width="6"
            height="6"
            x="100%"
            y="-3"
            class="stroke-primary-500 stroke-2"
          ></rect>
        {/if}
      </g>
    {:else}
      <div
        class="contents"
        role="presentation"
        onclick={select}
        onkeydown={selectOnEnter}
        class:edit-disable-pointer={activeMode === "edit"}
        class:outline-2={isSelected}
        class:outline-primary-500={isSelected}
        class:-outline-offset-2={isSelected}
      >
        {@render children?.()}
      </div>
    {/if}
  {:else}
    {@render children?.()}
  {/if}
{/if}

<style>
  :global(.edit-selection-outline) {
    position: fixed;
    border: 2px solid #0076ff;
    pointer-events: none; /* Let clicks pass directly through to HTML/SVG */
    z-index: 99999;
    box-sizing: border-box;
    /* Optional: smooth transition if layout changes subtly */
    transition:
      top 0.1s ease-out,
      left 0.1s ease-out,
      width 0.1s ease-out,
      height 0.1s ease-out;
  }

  .edit-disable-pointer :global(:is(input, textarea, select, button, a[href])) {
    pointer-events: none;
  }
</style>
