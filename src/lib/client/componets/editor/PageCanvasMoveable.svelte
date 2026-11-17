<script lang="ts">
  import { flushSync, onMount, tick } from "svelte";
  import type MoveableType from "moveable";
  import type {
    MoveableOptions,
    OnDrag,
    OnDragEnd,
    OnDragGroup,
    OnDragGroupEnd,
    OnDragOrigin,
    OnDragOriginEnd,
    OnDragOriginStart,
    OnResize,
    OnResizeEnd,
    OnResizeGroup,
    OnResizeGroupEnd,
    OnResizeGroupStart,
    OnResizeStart,
    OnRotate,
    OnRotateEnd,
    OnRotateGroup,
    OnRotateGroupEnd,
    OnRotateGroupStart,
    OnRotateStart,
    OnScale,
    OnScaleEnd,
    OnScaleGroup,
    OnScaleGroupEnd,
    OnScaleStart,
  } from "moveable";
  import {
    applyDrag as applyGeometryDrag,
    applyOriginDrag,
    applyResize as applyGeometryResize,
    applyRotate as applyGeometryRotate,
    captureBoxChanges,
    readBox,
    readUnits,
    type MoveableBox,
    type MoveableElement,
    type MoveableUnits,
  } from "$lib/client/editor/moveableGeometry";
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { isEditableTarget } from "$lib/client/editor/editorKeyboard";
  import { nudgeSortIndices, type NudgeDirection } from "$lib/client/editor/elementNudge";
  import {
    sortedChildren,
    type ElementAttributes,
    type ElementRecord,
    type ElementStyle,
  } from "$lib/elements/elementTypes";
  import { moveableSupportForElement, svgScaleAttributes } from "$lib/client/editor/svgMoveable";
  import { createSvgGeometryControlsAble } from "$lib/client/editor/svgGeometryControlsAble";

  let {
    canvasElement,
    targets,
    selectedElements,
  }: {
    canvasElement?: HTMLDivElement;
    targets: Array<HTMLElement | SVGElement>;
    selectedElements: ElementRecord[];
  } = $props();

  const editor = getEditorContext();

  const svgGeometryControlsAble = createSvgGeometryControlsAble({
    preview: (element, attributes) => {
      editor.elementsCollection?.mutateStateWithoutHistory((records) => {
        const item = records[element.id];
        if (item) item.attributes = { ...attributes };
      });
      flushSync();
    },
    commit: (element, attributes, baseAttributes) => {
      const collection = editor.elementsCollection;
      if (!collection) return;
      const changed = Object.entries(attributes).some(
        ([name, value]) => baseAttributes[name] !== value,
      );
      if (!changed) {
        collection.mutateStateWithoutHistory((records) => {
          const item = records[element.id];
          if (item) item.attributes = { ...baseAttributes };
        });
        return;
      }
      collection.mutateStateWithoutHistory((records) => {
        const item = records[element.id];
        if (item) item.attributes = { ...baseAttributes };
      });
      collection.update(element.id, { attributes, updatedAt: Date.now() });
    },
  });

  let moveable = $state.raw<MoveableType>();

  type GestureKind = "drag" | "resize" | "scale" | "rotate" | "origin";
  type GestureTarget = {
    target: MoveableElement;
    element: ElementRecord;
    start: MoveableBox;
    current: MoveableBox;
    units: MoveableUnits;
    original: {
      style: ElementStyle;
      attributes: ElementAttributes;
      sortIndex: number;
    };
    rect: DOMRect;
    scaleX: number;
    scaleY: number;
  };

  type Gesture = {
    kind: GestureKind;
    states: GestureTarget[];
  };

  type StaticDrag = {
    dx: number;
    dy: number;
  };

  type NudgeElementSnapshot = {
    style: ElementStyle;
    attributes: ElementAttributes;
    sortIndex: number;
  };

  let gesture: Gesture | null = null;
  let staticDrag: StaticDrag | null = null;
  let nudgeSession: Record<string, NudgeElementSnapshot> | null = null;

  function isStaticElement(element: ElementRecord | undefined) {
    if (!element || element.kind === "svg") return false;
    const position = element.style.position;
    return position !== "absolute" && position !== "fixed";
  }

  function createStates(): GestureTarget[] {
    return targets.flatMap((target, index) => {
      const selected = selectedElements[index];
      if (!selected) return [];
      const element = editor.elementsCollection?.state[selected.id] ?? selected;
      const start = readBox(element, target);

      return {
        target,
        element,
        start,
        current: { ...start },
        units: readUnits(element),
        original: {
          style: { ...element.style },
          attributes: { ...element.attributes },
          sortIndex: element.sortIndex,
        },
        rect: target.getBoundingClientRect(),
        scaleX: 1,
        scaleY: 1,
      };
    });
  }

  function beginGesture(kind: GestureKind) {
    if (nudgeSession) commitNudgeSelection();
    gesture = { kind, states: createStates() };
    staticDrag = kind === "drag" ? { dx: 0, dy: 0 } : null;
  }

  function stateFor(target: MoveableElement, kind: GestureKind) {
    if (!gesture || gesture.kind !== kind) beginGesture(kind);
    return gesture?.states.find((state) => state.target === target);
  }

  function originalElement(state: GestureTarget): ElementRecord {
    return {
      ...state.element,
      style: { ...state.original.style },
      attributes: { ...state.original.attributes },
    };
  }

  function mergeStyleChanges(
    original: ElementStyle,
    patch: Record<string, string> | undefined,
  ): ElementStyle {
    const next = { ...original };
    for (const [property, value] of Object.entries(patch ?? {})) {
      if (value === "") delete next[property];
      else next[property] = value;
    }
    return next;
  }

  function mergeAttributeChanges(
    original: ElementAttributes,
    patch: Record<string, string | number | boolean> | undefined,
  ): ElementAttributes {
    const next = { ...original };
    for (const [name, value] of Object.entries(patch ?? {})) {
      if (value === "") delete next[name];
      else next[name] = value;
    }
    return next;
  }

  function previewGeometry(state: GestureTarget) {
    const changes = captureBoxChanges(
      originalElement(state),
      state.start,
      state.current,
      state.units,
      state.target,
    );
    editor.elementsCollection?.mutateStateWithoutHistory((records) => {
      const item = records[state.element.id];
      if (!item) return;
      item.style = mergeStyleChanges(state.original.style, changes?.style);
      item.attributes = mergeAttributeChanges(state.original.attributes, changes?.attributes);
    });
    flushSync();
  }

  function previewScale(state: GestureTarget) {
    const source = originalElement(state);
    const attributes = svgScaleAttributes(
      source,
      state.start.w,
      state.start.h,
      state.scaleX,
      state.scaleY,
    );

    editor.elementsCollection?.mutateStateWithoutHistory((records) => {
      const item = records[state.element.id];
      if (!item) return;
      if (attributes) {
        item.attributes = mergeAttributeChanges(state.original.attributes, attributes);
        item.style = { ...state.original.style };
      } else {
        item.attributes = { ...state.original.attributes };
        item.style = {
          ...state.original.style,
          scale: `${state.scaleX} ${state.scaleY}`,
        };
      }
    });
    flushSync();
  }

  function previewStaticDrag(states: GestureTarget[], dx: number, dy: number) {
    editor.elementsCollection?.mutateStateWithoutHistory((records) => {
      for (const state of states) {
        const item = records[state.element.id];
        if (!item) continue;
        item.style = {
          ...state.original.style,
          transform: `translate(${dx}px, ${dy}px)`,
        };
      }
    });
    flushSync();
  }

  function targetOption() {
    if (targets.length === 0) return null;
    return targets.length === 1 ? targets[0] : targets;
  }

  function selectionSupport() {
    const support = selectedElements.map(moveableSupportForElement);
    return {
      resizable: support.length > 0 && support.every((item) => item.resizable),
      scalable: support.length > 0 && support.every((item) => item.scalable),
    };
  }

  function moveableOptions(): MoveableOptions {
    const support = selectionSupport();
    return {
      target: targetOption(),
      draggable: targets.length > 0,
      resizable: support.resizable,
      scalable: support.scalable,
      rotatable: targets.length > 0,
      origin: true,
      originDraggable: true,
      edge: false,
      throttleDrag: 0,
      throttleResize: 0,
      throttleScale: 0,
      throttleRotate: 0,
      zoom: editor.canvasZoom,
      container: document.body,
      rootContainer: document.body,
      useResizeObserver: true,
      preventClickEventOnDrag: true,
      ables: [svgGeometryControlsAble],
      props: {
        svgGeometryElement: selectedElements.length === 1 ? selectedElements[0] : null,
      },
    };
  }

  /**
   * re-orderes html nodes in the DOM with their siblings by dragging
   * @param states
   * @param dx
   * @param dy
   * @param changes
   */
  function applyStaticReorder(
    states: GestureTarget[],
    dx: number,
    dy: number,
    changes: Map<string, Partial<ElementRecord>>,
  ) {
    const axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
    const byParent = new Map<Element, GestureTarget[]>();

    for (const state of states) {
      const parent = state.target.parentElement;
      if (!parent) continue;
      const group = byParent.get(parent) ?? [];
      group.push(state);
      byParent.set(parent, group);
    }

    for (const [parent, group] of byParent) {
      const draggedIds = new Set(group.map((state) => state.element.id));
      const siblingElements = [...parent.children].filter(
        (child): child is Element =>
          child instanceof Element &&
          child.hasAttribute("data-element-id") &&
          !draggedIds.has(child.getAttribute("data-element-id") ?? ""),
      );
      const siblingIds = siblingElements
        .map((child) => child.getAttribute("data-element-id") ?? "")
        .filter(Boolean);
      const draggedIdsInOrder = [...group]
        .sort((a, b) => {
          const aCenter = axis === "x" ? a.rect.left + dx : a.rect.top + dy;
          const bCenter = axis === "x" ? b.rect.left + dx : b.rect.top + dy;
          return aCenter - bCenter;
        })
        .map((state) => state.element.id);

      const allIds = [...siblingIds];
      for (const id of draggedIdsInOrder) {
        const state = group.find((item) => item.element.id === id)!;
        const center =
          axis === "x"
            ? state.rect.left + state.rect.width / 2 + dx
            : state.rect.top + state.rect.height / 2 + dy;
        let insertIndex = allIds.length;
        for (let index = 0; index < allIds.length; index++) {
          const sibling = siblingElements.find(
            (element) => element.getAttribute("data-element-id") === allIds[index],
          );
          if (!sibling) continue;
          const rect = sibling.getBoundingClientRect();
          const siblingCenter =
            axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
          if (center < siblingCenter) {
            insertIndex = index;
            break;
          }
        }
        allIds.splice(insertIndex, 0, id);
      }

      for (let index = 0; index < allIds.length; index++) {
        const id = allIds[index];
        const element = editor.elementsCollection?.state[id];
        if (!element || element.sortIndex === index) continue;
        changes.set(id, { ...changes.get(id), sortIndex: index });
      }
    }
  }

  function gestureChanges(kind: GestureKind, state: GestureTarget) {
    if (kind === "scale") {
      const source = originalElement(state);
      const attributes = svgScaleAttributes(
        source,
        state.start.w,
        state.start.h,
        state.scaleX,
        state.scaleY,
      );
      if (attributes) {
        return { attributes: mergeAttributeChanges(state.original.attributes, attributes) };
      }
      return {
        style: {
          ...state.original.style,
          scale: `${state.scaleX} ${state.scaleY}`,
        },
      };
    }

    const changes = captureBoxChanges(
      originalElement(state),
      state.start,
      state.current,
      state.units,
      state.target,
    );
    if (!changes) return null;

    const next: Partial<ElementRecord> = {};
    if (changes.style) {
      next.style = mergeStyleChanges(state.original.style, changes.style);
    }
    if (changes.attributes) {
      next.attributes = mergeAttributeChanges(state.original.attributes, changes.attributes);
    }
    return next;
  }

  function finishGesture() {
    const active = gesture;
    if (!active) return;
    gesture = null;

    const drag = active.kind === "drag" ? staticDrag : null;
    staticDrag = null;

    const changes = new Map<string, Partial<ElementRecord>>();
    const staticStates = active.states.filter((state) => isStaticElement(state.element));

    if (drag && staticStates.length > 0) {
      applyStaticReorder(staticStates, drag.dx, drag.dy, changes);
    }

    for (const state of active.states) {
      if (isStaticElement(state.element)) continue;
      const change = gestureChanges(active.kind, state);
      if (!change) continue;
      changes.set(state.element.id, { ...changes.get(state.element.id), ...change });
    }

    const collection = editor.elementsCollection;
    collection?.mutateStateWithoutHistory((records) => {
      for (const state of active.states) {
        const item = records[state.element.id];
        if (!item) continue;
        item.style = { ...state.original.style };
        item.attributes = { ...state.original.attributes };
        item.sortIndex = state.original.sortIndex;
      }
    });

    if (changes.size > 0) {
      collection?.updateMany(
        [...changes].map(([id, change]) => ({
          id,
          changes: { ...change, updatedAt: Date.now() },
        })),
      );
    }

    void tick().then(() => moveable?.updateRect());
  }

  function createNudgeSession() {
    const collection = editor.elementsCollection;
    if (!collection) return null;

    const ids = new Set(editor.selectedElementIds);
    for (const id of [...ids]) {
      const element = collection.state[id];
      if (!element || !isStaticElement(element)) continue;
      for (const sibling of sortedChildren(collection.state, element.parentId)) {
        ids.add(sibling.id);
      }
    }

    const snapshot: Record<string, NudgeElementSnapshot> = {};
    for (const id of ids) {
      const element = collection.state[id];
      if (!element) continue;
      snapshot[id] = {
        style: { ...element.style },
        attributes: { ...element.attributes },
        sortIndex: element.sortIndex,
      };
    }

    return Object.keys(snapshot).length > 0 ? snapshot : null;
  }

  function previewNudgeSelection(dx: number, dy: number, direction: NudgeDirection) {
    const collection = editor.elementsCollection;
    if (!collection) return;

    const changes = new Map<string, Partial<ElementRecord>>();
    const staticIds: string[] = [];

    for (const state of createStates()) {
      if (isStaticElement(state.element)) {
        staticIds.push(state.element.id);
        continue;
      }

      const zoom = editor.canvasZoom;
      const current = applyGeometryDrag(
        state.start,
        [dx * zoom, dy * zoom],
        state.target,
        zoom,
      );
      const geometry = captureBoxChanges(
        originalElement(state),
        state.start,
        current,
        state.units,
        state.target,
      );
      if (!geometry) continue;

      const change: Partial<ElementRecord> = {};
      if (geometry.style) {
        change.style = mergeStyleChanges(state.original.style, geometry.style);
      }
      if (geometry.attributes) {
        change.attributes = mergeAttributeChanges(state.original.attributes, geometry.attributes);
      }
      changes.set(state.element.id, change);
    }

    if (staticIds.length > 0) {
      const sortChanges = nudgeSortIndices(collection.state, staticIds, direction);
      for (const [id, sortIndex] of Object.entries(sortChanges)) {
        changes.set(id, { ...changes.get(id), sortIndex });
      }
    }

    if (changes.size === 0) return;

    collection.mutateStateWithoutHistory((draft) => {
      for (const [id, change] of changes) {
        draft[id] = { ...draft[id], ...change };
      }
    });

    flushSync();
    moveable?.updateRect();
  }

  function commitNudgeSelection() {
    const collection = editor.elementsCollection;
    const session = nudgeSession;
    nudgeSession = null;
    if (!collection || !session) return;

    const changes = new Map<string, Partial<ElementRecord>>();

    for (const [id, original] of Object.entries(session)) {
      const element = collection.state[id];
      if (!element) continue;

      const change: Partial<ElementRecord> = {};
      if (JSON.stringify(element.style) !== JSON.stringify(original.style)) {
        change.style = { ...element.style };
      }
      if (JSON.stringify(element.attributes) !== JSON.stringify(original.attributes)) {
        change.attributes = { ...element.attributes };
      }
      if (element.sortIndex !== original.sortIndex) {
        change.sortIndex = element.sortIndex;
      }

      if (Object.keys(change).length > 0) changes.set(id, change);
    }

    collection.mutateStateWithoutHistory((records) => {
      for (const [id, original] of Object.entries(session)) {
        const item = records[id];
        if (!item) continue;
        item.style = { ...original.style };
        item.attributes = { ...original.attributes };
        item.sortIndex = original.sortIndex;
      }
    });

    if (changes.size > 0) {
      collection.updateMany(
        [...changes].map(([id, change]) => ({
          id,
          changes: { ...change, updatedAt: Date.now() },
        })),
      );
    }

    flushSync();
    moveable?.updateRect();
  }

  function handleNudgeKeydown(event: KeyboardEvent) {
    if (editor.mode !== "edit") return;
    if (isEditableTarget(event.target)) return;
    if (editor.selectedElementIds.length === 0) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const step = editor.grid.enabled ? Math.max(1, editor.grid.spacing) : 1;
    let dx = 0;
    let dy = 0;
    let direction: NudgeDirection = "next";

    switch (event.key) {
      case "ArrowUp":
        dy = -step;
        direction = "previous";
        break;
      case "ArrowDown":
        dy = step;
        break;
      case "ArrowLeft":
        dx = -step;
        direction = "previous";
        break;
      case "ArrowRight":
        dx = step;
        break;
      default:
        return;
    }

    event.preventDefault();
    nudgeSession ??= createNudgeSession();
    previewNudgeSelection(dx, dy, direction);
  }

  function handleNudgeKeyup(event: KeyboardEvent) {
    if (nudgeSession === null) return;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;

    event.preventDefault();
    commitNudgeSelection();
  }

  function onDragStart() {
    beginGesture("drag");
  }

  function applyDragEvent(event: OnDrag) {
    const state = stateFor(event.target, "drag");
    if (!state) return;

    if (isStaticElement(state.element)) {
      if (!staticDrag) staticDrag = { dx: 0, dy: 0 };
      staticDrag.dx = event.dist[0];
      staticDrag.dy = event.dist[1];
      const zoom = editor.canvasZoom;
      previewStaticDrag(
        gesture?.states.filter((item) => isStaticElement(item.element)) ?? [],
        event.dist[0] / zoom,
        event.dist[1] / zoom,
      );
      return;
    }

    state.current = applyGeometryDrag(
      state.start,
      event.dist,
      state.target,
      editor.canvasZoom,
    );
    previewGeometry(state);
  }

  function onDrag(event: OnDrag) {
    applyDragEvent(event);
  }

  function onDragGroup(event: OnDragGroup) {
    event.events.forEach(applyDragEvent);
  }

  function onDragEnd() {
    finishGesture();
  }

  function onDragGroupEnd() {
    finishGesture();
  }

  function onResizeStart() {
    beginGesture("resize");
  }

  function applyResizeEvent(event: OnResize & { drag: { delta: number[] } }) {
    const state = stateFor(event.target, "resize");
    if (!state) return;
    state.current = applyGeometryResize(
      state.current,
      event.width,
      event.height,
      event.drag.delta,
      state.target,
      editor.canvasZoom,
    );
    previewGeometry(state);
  }

  function onResize(event: OnResize) {
    applyResizeEvent(event as OnResize & { drag: { delta: number[] } });
  }

  function onResizeGroup(event: OnResizeGroup) {
    event.events.forEach((child) =>
      applyResizeEvent(child as OnResize & { drag: { delta: number[] } }),
    );
  }

  function onResizeEnd() {
    finishGesture();
  }

  function onResizeGroupEnd() {
    finishGesture();
  }

  function onScaleStart() {
    beginGesture("scale");
  }

  function applyScaleEvent(event: OnScale) {
    const state = stateFor(event.target, "scale");
    if (!state) return;
    state.scaleX = event.scale[0];
    state.scaleY = event.scale[1];
    state.current = {
      ...state.current,
      w: state.start.w * state.scaleX,
      h: state.start.h * state.scaleY,
    };
    previewScale(state);
  }

  function onScale(event: OnScale) {
    applyScaleEvent(event);
  }

  function onScaleGroup(event: OnScaleGroup) {
    event.events.forEach(applyScaleEvent);
  }

  function onScaleEnd() {
    finishGesture();
  }

  function onScaleGroupEnd() {
    finishGesture();
  }

  function onRotateStart() {
    beginGesture("rotate");
  }

  function applyRotateEvent(event: OnRotate & { rotation: number }) {
    const state = stateFor(event.target, "rotate");
    if (!state) return;
    state.current = applyGeometryRotate(state.current, event.rotation);
    previewGeometry(state);
  }

  function onRotate(event: OnRotate) {
    applyRotateEvent(event as OnRotate & { rotation: number });
  }

  function onRotateGroup(event: OnRotateGroup) {
    event.events.forEach((child) => applyRotateEvent(child as OnRotate & { rotation: number }));
  }

  function onRotateEnd() {
    finishGesture();
  }

  function onRotateGroupEnd() {
    finishGesture();
  }

  function onDragOriginStart() {
    beginGesture("origin");
  }

  function onDragOrigin(event: OnDragOrigin) {
    const state = stateFor(event.target, "origin");
    if (!state) return;
    state.current = applyOriginDrag(state.current, state.start, event.origin);
    previewGeometry(state);
  }

  function onDragOriginEnd() {
    finishGesture();
  }

  $effect(() => {
    void targets;
    void selectedElements;
    void canvasElement;
    void editor.canvasZoom;
    moveable?.setState(moveableOptions(), () => {
      moveable?.updateRect();
    });
  });

  $effect(() => {
    const signature = selectedElements
      .map(
        (element) =>
          `${element.id}:${JSON.stringify(element.style)}:${JSON.stringify(element.attributes)}`,
      )
      .join("|");
    void signature;
    void targets;

    const instance = moveable;
    if (!instance) return;

    const frame = requestAnimationFrame(() => {
      if (!gesture) instance.updateRect();
    });
    return () => cancelAnimationFrame(frame);
  });

  onMount(() => {
    let disposed = false;
    let instance: MoveableType | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let frame = 0;

    canvasElement?.addEventListener("keydown", handleNudgeKeydown);
    canvasElement?.addEventListener("keyup", handleNudgeKeyup);

    const syncRect = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => instance?.updateRect());
    };

    void import("moveable").then(({ default: Moveable }) => {
      if (disposed || !canvasElement) return;
      instance = new Moveable(document.body, moveableOptions());
      instance.on("dragStart", onDragStart);
      instance.on("drag", onDrag);
      instance.on("dragEnd", onDragEnd);
      instance.on("dragGroupStart", onDragStart);
      instance.on("dragGroup", onDragGroup);
      instance.on("dragGroupEnd", onDragGroupEnd);
      instance.on("resizeStart", onResizeStart);
      instance.on("resize", onResize);
      instance.on("resizeEnd", onResizeEnd);
      instance.on("resizeGroupStart", onResizeStart);
      instance.on("resizeGroup", onResizeGroup);
      instance.on("resizeGroupEnd", onResizeGroupEnd);
      instance.on("scaleStart", onScaleStart);
      instance.on("scale", onScale);
      instance.on("scaleEnd", onScaleEnd);
      instance.on("scaleGroupStart", onScaleStart);
      instance.on("scaleGroup", onScaleGroup);
      instance.on("scaleGroupEnd", onScaleGroupEnd);
      instance.on("rotateStart", onRotateStart);
      instance.on("rotate", onRotate);
      instance.on("rotateEnd", onRotateEnd);
      instance.on("rotateGroupStart", onRotateStart);
      instance.on("rotateGroup", onRotateGroup);
      instance.on("rotateGroupEnd", onRotateGroupEnd);
      instance.on("dragOriginStart", onDragOriginStart);
      instance.on("dragOrigin", onDragOrigin);
      instance.on("dragOriginEnd", onDragOriginEnd);
      moveable = instance;
      moveable.setState(moveableOptions(), () => {
        moveable?.updateRect();
      });

      canvasElement?.addEventListener("scroll", syncRect, { passive: true });
      window.addEventListener("resize", syncRect);
      resizeObserver = new ResizeObserver(syncRect);
      resizeObserver.observe(canvasElement!);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      canvasElement?.removeEventListener("keydown", handleNudgeKeydown);
      canvasElement?.removeEventListener("keyup", handleNudgeKeyup);
      canvasElement?.removeEventListener("scroll", syncRect);
      window.removeEventListener("resize", syncRect);
      resizeObserver?.disconnect();
      instance?.destroy();
      moveable = undefined;
    };
  });
</script>
