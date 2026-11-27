<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { handleEditorKeyup, isEditableTarget } from "$lib/client/editor/editorKeyboard";
  import type { EditorMode, UserComponentDefinition } from "$lib/client/editor/editorState.svelte";
  import type { ElementRecord } from "$lib/elements/elementTypes";
  import { attempt } from "$lib/util/attempt";
  import { onMount, tick, untrack } from "svelte";
  import { elementStyleToString, sortedChildren } from "$lib/elements/elementTypes";
  import { Menu, Portal } from "@skeletonlabs/skeleton-svelte";
  import PageElement from "./PageElement.svelte";
  import PageCanvasMoveable from "./PageCanvasMoveable.svelte";

  type Props = {
    elements: Record<string, ElementRecord>;
    mode?: EditorMode;
    userComponents?: UserComponentDefinition[];
    themeName?: string;
  };

  let { elements, mode, userComponents, themeName }: Props = $props();

  const editorResult = attempt(() => getEditorContext());
  const editor = editorResult.isOk ? editorResult.data : undefined;
  let canvasElement: HTMLDivElement | undefined = $state();

  let activeMode = $derived(mode ?? editor?.mode ?? "preview");
  let componentDefinitions = $derived(userComponents ?? editor?.userComponents ?? []);
  let roots = $derived(sortedChildren(elements, null));
  let moveableTargets = $state<Array<HTMLElement | SVGElement>>([]);
  let selectedElements = $derived(editor?.selectedElements ?? []);

  type PanGesture = {
    pointerId: number;
    button: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  };

  let ctrlPressed = $state(false);
  let lastCursor = $state<{ x: number; y: number } | null>(null);
  let panGesture: PanGesture | null = null;
  let suppressClick = false;
  let previousZoom = editor?.canvasZoom ?? 1;
  let lastResetToken = editor?.canvasViewResetToken ?? 0;

  /**
   * Converts viewport coordinates to canvas-relative coordinates.
   *
   * @param clientX - Pointer X position in viewport coordinates.
   * @param clientY - Pointer Y position in viewport coordinates.
   * @returns Position relative to the canvas and its bounding rect, or null when unmounted.
   */
  function canvasPoint(clientX: number, clientY: number) {
    if (!canvasElement) return null;
    const rect = canvasElement.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top, rect };
  }

  /**
   * Records the last pointer position while inside the canvas or panning.
   *
   * @param event - Pointer event carrying viewport coordinates.
   */
  function updateLastCursor(event: PointerEvent) {
    const point = canvasPoint(event.clientX, event.clientY);
    if (!point) return;
    const inside =
      point.x >= 0 && point.y >= 0 && point.x <= point.rect.width && point.y <= point.rect.height;
    if (inside || panGesture) lastCursor = { x: point.x, y: point.y };
  }

  /**
   * Starts a canvas pan gesture on middle-click or Ctrl+left-click.
   *
   * @param event - Pointer down event on the canvas.
   */
  function handleCanvasPointerDown(event: PointerEvent) {
    if (isEditableTarget(event.target)) return;
    canvasElement?.focus({ preventScroll: true });

    const shouldPan = event.button === 1 || (event.button === 0 && ctrlPressed);
    if (!shouldPan || !canvasElement || !editor) return;

    event.preventDefault();
    event.stopPropagation();
    updateLastCursor(event);
    canvasElement.setPointerCapture(event.pointerId);
    panGesture = {
      pointerId: event.pointerId,
      button: event.button,
      startX: event.clientX,
      startY: event.clientY,
      originX: editor.canvasPanX,
      originY: editor.canvasPanY,
      moved: false,
    };
  }

  /**
   * Updates the canvas pan while a pan gesture is active.
   *
   * @param event - Pointer move event from the window.
   */
  function handlePointerMove(event: PointerEvent) {
    updateLastCursor(event);
    if (!panGesture || event.pointerId !== panGesture.pointerId || !editor) return;

    const dx = event.clientX - panGesture.startX;
    const dy = event.clientY - panGesture.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panGesture.moved = true;
    editor.setCanvasPan(panGesture.originX + dx, panGesture.originY + dy);
  }

  /**
   * Ends the active pan gesture and releases pointer capture.
   *
   * @param event - Pointer up or cancel event from the window.
   */
  function endPan(event: PointerEvent) {
    if (!panGesture || event.pointerId !== panGesture.pointerId) return;
    if (panGesture.moved && panGesture.button === 0) suppressClick = true;
    if (canvasElement?.hasPointerCapture(event.pointerId)) {
      canvasElement.releasePointerCapture(event.pointerId);
    }
    panGesture = null;
  }

  /**
   * Handles Ctrl/Cmd zoom and reset keyboard shortcuts in edit mode.
   *
   * @param event - Keydown event from the canvas.
   * @returns True when the shortcut was handled, false otherwise.
   */
  function handleZoomKeydown(event: KeyboardEvent) {
    if (activeMode !== "edit" || !editor) return;
    if (!(event.ctrlKey || event.metaKey) || isEditableTarget(event.target)) return;

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      editor.zoomIn();
      return true;
    }
    if (event.key === "-") {
      event.preventDefault();
      editor.zoomOut();
      return true;
    }
    if (event.key === "0") {
      event.preventDefault();
      editor.resetCanvasZoom();
      return true;
    }
    return false;
  }

  onMount(() => {
    if (!canvasElement) return;

    /**
     * Zooms the canvas with Ctrl/Cmd plus wheel.
     *
     * @param event - Wheel event from the canvas.
     */
    const handleWheel = (event: WheelEvent) => {
      if (activeMode !== "edit" || !editor) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (!canvasElement) return;

      event.preventDefault();

      const point = canvasPoint(event.clientX, event.clientY);
      if (point) {
        lastCursor = { x: point.x, y: point.y };
      }

      if (event.deltaY < 0) editor.zoomIn();
      else editor.zoomOut();
    };

    /**
     * Tracks the Control key being held down over the canvas.
     *
     * @param event - Keydown event from the window.
     */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Control" || event.repeat) return;
      if (activeMode !== "edit" || isEditableTarget(event.target)) return;
      if (document.activeElement !== canvasElement) return;
      event.preventDefault();
      ctrlPressed = true;
    };

    /**
     * Clears the Control-key pressed state.
     *
     * @param event - Keyup event from the window.
     */
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Control") return;
      ctrlPressed = false;
    };

    canvasElement.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endPan);
    window.addEventListener("pointercancel", endPan);

    return () => {
      canvasElement?.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endPan);
      window.removeEventListener("pointercancel", endPan);
    };
  });

  $effect(() => {
    if (!editor || !canvasElement) return;
    const zoom = editor.canvasZoom;
    const resetToken = editor.canvasViewResetToken;

    if (resetToken !== lastResetToken) {
      lastResetToken = resetToken;
      previousZoom = zoom;
      return;
    }

    if (zoom === previousZoom) return;

    const oldZoom = previousZoom;
    previousZoom = zoom;
    const rect = canvasElement.getBoundingClientRect();
    const cursor = lastCursor ?? { x: rect.width / 2, y: rect.height / 2 };
    const scrollLeft = canvasElement.scrollLeft;
    const scrollTop = canvasElement.scrollTop;
    const panX = untrack(() => editor.canvasPanX);
    const panY = untrack(() => editor.canvasPanY);
    const contentX = (scrollLeft + cursor.x - panX) / oldZoom;
    const contentY = (scrollTop + cursor.y - panY) / oldZoom;
    const nextPanX = scrollLeft + cursor.x - contentX * zoom;
    const nextPanY = scrollTop + cursor.y - contentY * zoom;

    untrack(() => editor.setCanvasPan(nextPanX, nextPanY));
  });

  $effect(() => {
    if (activeMode === "preview") canvasElement?.focus({ preventScroll: true });
  });

  $effect(() => {
    const ids = activeMode === "edit" ? (editor?.selectedElementIds ?? []) : [];
    void roots;
    void selectedElements;
    let cancelled = false;

    tick().then(() => {
      if (cancelled || !canvasElement) return;
      moveableTargets = ids.flatMap((id) => {
        const target = canvasElement?.querySelector<HTMLElement | SVGElement>(
          `[data-element-id="${CSS.escape(id)}"]`,
        );
        return target ? [target] : [];
      });
    });

    return () => {
      cancelled = true;
    };
  });
</script>

<div
  bind:this={canvasElement}
  id="editor-canvas"
  class="relative min-h-full w-full overflow-clip bg-surface-50-950 outline-none"
  role="presentation"
  tabindex="-1"
  onpointerdowncapture={handleCanvasPointerDown}
  onkeydown={(event) => {
    if (handleZoomKeydown(event)) return;
    if (editor) handleEditorKeyup(editor, event);
  }}
  onclick={(event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (activeMode !== "edit") return;
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest(
        ".moveable-control-box, .moveable-line, .moveable-control, .moveable-area, .moveable-origin",
      )
    ) {
      return;
    }
    const element = target?.closest("[data-element-id]");
    const id = element?.dataset.elementId;
    if (id) {
      editor?.selectElement(id, {
        additive: event.ctrlKey || event.metaKey,
        range: event.shiftKey,
      });
      return;
    }
    editor?.clearElementSelection();
  }}
>
  <div
    class="page-canvas"
    class:page-grid={editor?.grid.enabled}
    style="--grid-spacing:{editor?.grid.spacing ?? 20}px;transform:translate({editor?.canvasPanX ??
      0}px, {editor?.canvasPanY ?? 0}px) scale({editor?.canvasZoom ?? 1});transform-origin:top left"
    data-theme={themeName}
  >
    {#if roots.length === 0}
      <div class="absolute inset-0 flex items-center justify-center text-sm text-surface-500">
        Empty page — add an element from the Elements tab.
      </div>
    {/if}
    {#each roots as element (element.id)}
      <PageElement {element} {elements} mode={activeMode} userComponents={componentDefinitions} />
    {/each}
  </div>
</div>

{#if activeMode === "edit" && canvasElement && moveableTargets.length > 0}
  <PageCanvasMoveable {canvasElement} targets={moveableTargets} {selectedElements} />
{/if}

<style>
  .page-canvas {
    position: relative;
    min-height: 80vh;
    transform-origin: top left;
    will-change: transform;
  }

  .page-grid {
    background-image:
      linear-gradient(
        to right,
        color-mix(in oklab, var(--color-surface-500) 10%, transparent) 1px,
        transparent 1px
      ),
      linear-gradient(
        to bottom,
        color-mix(in oklab, var(--color-surface-500) 10%, transparent) 1px,
        transparent 1px
      );
    background-size: var(--grid-spacing) var(--grid-spacing);
  }
</style>
