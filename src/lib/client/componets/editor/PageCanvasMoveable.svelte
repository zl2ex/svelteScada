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
    snapBoxToGrid,
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
    originBox: MoveableBox;
    start: MoveableBox;
    current: MoveableBox;
    units: MoveableUnits;
    original: {
      style: ElementStyle;
      attributes: ElementAttributes;
      sortIndex: number;
    };
    baseStyle: ElementStyle;
    baseAttributes: ElementAttributes;
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

  let gesture = $state.raw<Gesture | null>(null);
  let staticDrag: StaticDrag | null = null;
  let nudgeSession: Record<string, NudgeElementSnapshot> | null = null;

  /**
   * Returns whether an element uses static flow layout rather than absolute or fixed positioning.
   *
   * SVG elements are always treated as non-static.
   *
   * @param element - element record to inspect, may be undefined
   * @returns true when the element is a non-SVG element in normal flow
   */
  function isStaticElement(element: ElementRecord | undefined) {
    if (!element || element.kind === "svg") return false;
    const position = element.style.position;
    return position !== "absolute" && position !== "fixed";
  }

  /**
   * Builds gesture snapshots for every target that still has a selected element.
   *
   * @returns fresh gesture target snapshots with geometry, units and original values
   */
  function createStates(): GestureTarget[] {
    return targets.flatMap((target, index) => {
      const selected = selectedElements[index];
      if (!selected) return [];
      const element = editor.elementsCollection?.state[selected.id] ?? selected;
      const start = readBox(element, target);

      return {
        target,
        element,
        originBox: { ...start },
        start,
        current: { ...start },
        units: readUnits(element),
        original: {
          style: { ...element.style },
          attributes: { ...element.attributes },
          sortIndex: element.sortIndex,
        },
        baseStyle: { ...element.style },
        baseAttributes: { ...element.attributes },
        rect: target.getBoundingClientRect(),
        scaleX: 1,
        scaleY: 1,
      };
    });
  }

  /**
   * Snaps each non-static gesture box to the grid and writes the preview state.
   *
   * Mutates the provided snapshots, updates the element collection without history and refreshes
   * the moveable rect.
   *
   * @param states - gesture snapshots whose start boxes are snapped to the grid
   */
  function snapGestureBoxes(states: GestureTarget[]) {
    const collection = editor.elementsCollection;
    if (!collection) return;

    let changedAny = false;

    for (const state of states) {
      if (isStaticElement(state.element)) continue;

      const snapped = snapBoxToGrid(state.start);
      if (
        snapped.x === state.start.x &&
        snapped.y === state.start.y &&
        snapped.w === state.start.w &&
        snapped.h === state.start.h
      ) {
        continue;
      }

      const changes = captureBoxChanges(
        originalElement(state),
        state.originBox,
        snapped,
        state.units,
        state.target,
        true,
      );
      if (!changes) continue;

      state.start = snapped;
      state.current = { ...snapped };
      state.baseStyle = mergeStyleChanges(state.original.style, changes.style);
      state.baseAttributes = mergeAttributeChanges(state.original.attributes, changes.attributes);
      changedAny = true;
    }

    if (!changedAny) return;

    collection.mutateStateWithoutHistory((records) => {
      for (const state of states) {
        if (isStaticElement(state.element)) continue;
        const item = records[state.element.id];
        if (!item) continue;
        item.style = { ...state.baseStyle };
        item.attributes = { ...state.baseAttributes };
      }
    });

    flushSync();
    moveable?.updateRect();
  }

  /**
   * Starts a gesture of the given kind, committing any pending nudge session first.
   *
   * @param kind - gesture kind to begin
   */
  function beginGesture(kind: GestureKind) {
    if (nudgeSession) commitNudgeSelection();
    gesture = { kind, states: createStates() };
    staticDrag = kind === "drag" ? { dx: 0, dy: 0 } : null;
    if (kind === "drag" || kind === "resize") snapGestureBoxes(gesture.states);
  }

  /**
   * Finds the gesture snapshot for a target, starting a new gesture when needed.
   *
   * @param target - moveable target to look up
   * @param kind - gesture kind the target must belong to
   * @returns the matching gesture target snapshot, or undefined when not tracked
   */
  function stateFor(target: MoveableElement, kind: GestureKind) {
    if (!gesture || gesture.kind !== kind) beginGesture(kind);
    return gesture?.states.find((state) => state.target === target);
  }

  /**
   * Builds an element record using the pre-gesture style, attributes and sort index.
   *
   * @param state - gesture target snapshot to read from
   * @returns element record cloned from the original values
   */
  function originalElement(state: GestureTarget): ElementRecord {
    return {
      ...state.element,
      style: { ...state.original.style },
      attributes: { ...state.original.attributes },
    };
  }

  /**
   * Builds an element record using the current base style and attributes of a gesture.
   *
   * @param state - gesture target snapshot to read from
   * @returns element record cloned from the base values
   */
  function previewElement(state: GestureTarget): ElementRecord {
    return {
      ...state.element,
      style: { ...state.baseStyle },
      attributes: { ...state.baseAttributes },
    };
  }

  /**
   * Merges a style patch into a copy of the original style.
   *
   * Empty string values remove the corresponding property.
   *
   * @param original - base style to copy
   * @param patch - style changes to apply, may be undefined
   * @returns the merged style object
   */
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

  /**
   * Merges an attribute patch into a copy of the original attributes.
   *
   * Empty string values remove the corresponding attribute.
   *
   * @param original - base attributes to copy
   * @param patch - attribute changes to apply, may be undefined
   * @returns the merged attributes object
   */
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

  /**
   * Writes a geometry preview for a target into the element collection without history.
   *
   * @param state - gesture snapshot whose current box is previewed
   */
  function previewGeometry(state: GestureTarget) {
    const changes = captureBoxChanges(
      previewElement(state),
      state.start,
      state.current,
      state.units,
      state.target,
    );

    editor.elementsCollection?.mutateStateWithoutHistory((records) => {
      const item = records[state.element.id];
      if (!item) return;
      item.style = mergeStyleChanges(state.baseStyle, changes?.style);
      item.attributes = mergeAttributeChanges(state.baseAttributes, changes?.attributes);
    });
    flushSync();
  }

  /**
   * Writes a scale preview for a target, preferring SVG scale attributes when available.
   *
   * @param state - gesture snapshot holding the current scale factors
   */
  function previewScale(state: GestureTarget) {
    const source = previewElement(state);
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
        item.attributes = mergeAttributeChanges(state.baseAttributes, attributes);
        item.style = { ...state.baseStyle };
      } else {
        item.attributes = { ...state.baseAttributes };
        item.style = {
          ...state.baseStyle,
          scale: `${state.scaleX} ${state.scaleY}`,
        };
      }
    });
    flushSync();
  }

  /**
   * Previews a translation-only drag for static-flow elements using a CSS transform.
   *
   * @param states - gesture snapshots belonging to static elements
   * @param dx - horizontal drag distance in pixels
   * @param dy - vertical drag distance in pixels
   */
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

  /**
   * Returns the moveable target option for the current target list.
   *
   * @returns null for no targets, the sole target for one, or the target list otherwise
   */
  function targetOption() {
    if (targets.length === 0) return null;
    return targets.length === 1 ? targets[0] : targets;
  }

  /**
   * Computes resize and scale support shared by every selected element.
   *
   * @returns capability flags that are true only when all selected elements support them
   */
  function selectionSupport() {
    const support = selectedElements.map(moveableSupportForElement);
    return {
      resizable: support.length > 0 && support.every((item) => item.resizable),
      scalable: support.length > 0 && support.every((item) => item.scalable),
    };
  }

  /**
   * Builds the moveable options from the current targets, selection, grid and canvas.
   *
   * @returns moveable options including container, throttles and the SVG geometry control
   */
  function moveableOptions(): MoveableOptions {
    const support = selectionSupport();
    const container = canvasElement ?? document.body;
    return {
      target: targetOption(),
      draggable: targets.length > 0,
      resizable: support.resizable,
      scalable: support.scalable,
      rotatable: targets.length > 0,
      origin: true,
      originDraggable: true,
      edge: false,
      throttleDrag: editor.grid.spacing,
      throttleResize: editor.grid.spacing,
      throttleScale: editor.grid.spacing,
      throttleRotate: 1,
      checkResizableError: false,
      container,
      rootContainer: container,
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
   *
   * Records sortIndex changes for the dragged static elements and their siblings.
   *
   * @param states - gesture snapshots belonging to static elements
   * @param dx - horizontal drag distance in pixels
   * @param dy - vertical drag distance in pixels
   * @param changes - map collecting pending element changes per id
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

  /**
   * Ends the active gesture, restoring original state and committing collected changes.
   *
   * Static reordering and geometry changes are written as one updateMany call; the moveable
   * rect is refreshed after the next tick.
   */
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
      const current = editor.elementsCollection?.state[state.element.id];
      if (!current) continue;

      const change: Partial<ElementRecord> = {};
      if (JSON.stringify(current.style) !== JSON.stringify(state.original.style)) {
        change.style = { ...current.style };
      }
      if (JSON.stringify(current.attributes) !== JSON.stringify(state.original.attributes)) {
        change.attributes = { ...current.attributes };
      }
      if (Object.keys(change).length > 0) {
        changes.set(state.element.id, { ...changes.get(state.element.id), ...change });
      }
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

  /**
   * Snapshots the selected elements and static siblings before a keyboard nudge begins.
   *
   * @returns a map of id to pre-nudge style, attributes and sort index, or null when empty
   */
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

  /**
   * Previews a keyboard nudge, moving free elements and reordering static ones.
   *
   * @param dx - horizontal nudge distance in pixels
   * @param dy - vertical nudge distance in pixels
   * @param direction - sibling ordering direction for static elements
   */
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

      const current = applyGeometryDrag(state.start, [dx, dy], state.target);
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

  /**
   * Commits the active nudge session, restoring originals and pushing one history entry.
   *
   * Clears the session and refreshes the moveable rect.
   */
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

  /**
   * Handles arrow-key presses that nudge the selection by one grid step.
   *
   * Opens a nudge session lazily and ignores events outside edit mode or in editable targets.
   *
   * @param event - keydown event from the canvas
   */
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

  /**
   * Commits the nudge session when an arrow key is released.
   *
   * @param event - keyup event from the canvas
   */
  function handleNudgeKeyup(event: KeyboardEvent) {
    if (nudgeSession === null) return;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;

    event.preventDefault();
    commitNudgeSelection();
  }

  /**
   * Starts a drag gesture.
   */
  function onDragStart() {
    beginGesture("drag");
  }

  /**
   * Applies one drag event, routing static elements to reorder previews and others to geometry.
   *
   * @param event - moveable drag event for a single target
   */
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

    // TD WIP
    //console.debug(event);
    //state.element.style = { ...state.element.style, transform: event.transform };
    state.current = applyGeometryDrag(state.start, event.dist, state.target, editor.canvasZoom);
    previewGeometry(state);
  }

  /**
   * Handles a single-target drag event.
   *
   * @param event - moveable drag event
   */
  function onDrag(event: OnDrag) {
    applyDragEvent(event);
  }

  /**
   * Applies each child event of a group drag.
   *
   * @param event - group drag event containing per-target events
   */
  function onDragGroup(event: OnDragGroup) {
    event.events.forEach(applyDragEvent);
  }

  /**
   * Ends a single-target drag gesture.
   */
  function onDragEnd() {
    finishGesture();
  }

  /**
   * Ends a group drag gesture.
   */
  function onDragGroupEnd() {
    finishGesture();
  }

  /**
   * Starts a resize gesture.
   */
  function onResizeStart() {
    beginGesture("resize");
  }

  /**
   * Applies one resize event, updating the target box and previewing the geometry.
   *
   * @param event - resize event including distance and drag delta
   */
  function applyResizeEvent(event: OnResize & { dist: number[]; drag: { delta: number[] } }) {
    const state = stateFor(event.target, "resize");
    if (!state) return;
    state.current = applyGeometryResize(
      state.start,
      state.current,
      event.dist,
      event.drag.delta,
      state.target,
      editor.canvasZoom,
    );
    previewGeometry(state);
  }

  /**
   * Handles a single-target resize event.
   *
   * @param event - moveable resize event
   */
  function onResize(event: OnResize) {
    applyResizeEvent(event as OnResize & { dist: number[]; drag: { delta: number[] } });
  }

  /**
   * Applies each child event of a group resize.
   *
   * @param event - group resize event containing per-target events
   */
  function onResizeGroup(event: OnResizeGroup) {
    event.events.forEach((child) =>
      applyResizeEvent(child as OnResize & { dist: number[]; drag: { delta: number[] } }),
    );
  }

  /**
   * Ends a single-target resize gesture.
   */
  function onResizeEnd() {
    finishGesture();
  }

  /**
   * Ends a group resize gesture.
   */
  function onResizeGroupEnd() {
    finishGesture();
  }

  /**
   * Starts a scale gesture.
   */
  function onScaleStart() {
    beginGesture("scale");
  }

  /**
   * Applies one scale event, updating the scale factors and previewing the result.
   *
   * @param event - moveable scale event with the current scale factors
   */
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

  /**
   * Handles a single-target scale event.
   *
   * @param event - moveable scale event
   */
  function onScale(event: OnScale) {
    applyScaleEvent(event);
  }

  /**
   * Applies each child event of a group scale.
   *
   * @param event - group scale event containing per-target events
   */
  function onScaleGroup(event: OnScaleGroup) {
    event.events.forEach(applyScaleEvent);
  }

  /**
   * Ends a single-target scale gesture.
   */
  function onScaleEnd() {
    finishGesture();
  }

  /**
   * Ends a group scale gesture.
   */
  function onScaleGroupEnd() {
    finishGesture();
  }

  /**
   * Starts a rotate gesture.
   */
  function onRotateStart() {
    beginGesture("rotate");
  }

  /**
   * Applies one rotate event and previews the rotated geometry.
   *
   * @param event - rotate event including the rotation angle
   */
  function applyRotateEvent(event: OnRotate & { rotation: number }) {
    const state = stateFor(event.target, "rotate");
    if (!state) return;
    state.current = applyGeometryRotate(state.current, event.rotation);
    previewGeometry(state);
  }

  /**
   * Handles a single-target rotate event.
   *
   * @param event - moveable rotate event
   */
  function onRotate(event: OnRotate) {
    applyRotateEvent(event as OnRotate & { rotation: number });
  }

  /**
   * Applies each child event of a group rotate.
   *
   * @param event - group rotate event containing per-target events
   */
  function onRotateGroup(event: OnRotateGroup) {
    event.events.forEach((child) => applyRotateEvent(child as OnRotate & { rotation: number }));
  }

  /**
   * Ends a single-target rotate gesture.
   */
  function onRotateEnd() {
    finishGesture();
  }

  /**
   * Ends a group rotate gesture.
   */
  function onRotateGroupEnd() {
    finishGesture();
  }

  /**
   * Starts an origin-drag gesture.
   */
  function onDragOriginStart() {
    beginGesture("origin");
  }

  /**
   * Applies an origin-drag event and previews the resulting geometry.
   *
   * @param event - moveable origin drag event with the new origin
   */
  function onDragOrigin(event: OnDragOrigin) {
    const state = stateFor(event.target, "origin");
    if (!state) return;
    state.current = applyOriginDrag(state.current, state.start, event.origin);
    previewGeometry(state);
  }

  /**
   * Ends an origin-drag gesture.
   */
  function onDragOriginEnd() {
    finishGesture();
  }

  $effect(() => {
    void targets;
    void selectedElements;
    void canvasElement;
    void editor.canvasZoom;
    void editor.canvasPanX;
    void editor.canvasPanY;

    const active = gesture;
    if (active) return;

    moveable?.setState(moveableOptions(), () => {
      moveable?.updateRect();
    });
  });

  $effect(() => {
    const active = gesture;
    if (active) return;

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

    /**
     * Schedules a cancellation-safe animation-frame update of the moveable rect.
     */
    const syncRect = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => instance?.updateRect());
    };

    void import("moveable").then(({ default: Moveable }) => {
      if (disposed || !canvasElement) return;
      instance = new Moveable(canvasElement, moveableOptions());
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

      window.addEventListener("scroll", syncRect, { capture: true, passive: true });
      window.addEventListener("resize", syncRect);
      resizeObserver = new ResizeObserver(syncRect);
      resizeObserver.observe(canvasElement!);
      const pageCanvas = canvasElement.querySelector(".page-canvas");
      if (pageCanvas) resizeObserver.observe(pageCanvas);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      canvasElement?.removeEventListener("keydown", handleNudgeKeydown);
      canvasElement?.removeEventListener("keyup", handleNudgeKeyup);
      window.removeEventListener("scroll", syncRect, { capture: true });
      window.removeEventListener("resize", syncRect);
      resizeObserver?.disconnect();
      instance?.destroy();
      moveable = undefined;
    };
  });
</script>
