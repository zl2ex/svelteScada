<script lang="ts">
  import { onMount, tick } from "svelte";
  import type MoveableType from "moveable";
  import type {
    MoveableOptions,
    OnDrag,
    OnDragEnd,
    OnDragGroup,
    OnDragGroupEnd,
    OnResize,
    OnResizeEnd,
    OnResizeGroup,
    OnResizeGroupEnd,
    OnRotate,
    OnRotateEnd,
    OnRotateGroup,
    OnRotateGroupEnd,
    OnScale,
    OnScaleEnd,
    OnScaleGroup,
    OnScaleGroupEnd,
  } from "moveable";
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import type { ElementAttributes, ElementRecord, ElementStyle } from "$lib/elements/elementTypes";
  import {
    moveableSupportForElement,
    svgDragAttributes,
    svgScaleAttributes,
  } from "$lib/client/editor/svgMoveable";
  import { getSvgCreatePointRoot, getSvgScreenCTM } from "$lib/client/editor/svgGeometryControls";
  import { createSvgGeometryControlsAble } from "$lib/client/editor/svgGeometryControlsAble";
  import { reorderIds } from "$lib/client/util/dragging";

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

  const svgGeometryControlsAble = createSvgGeometryControlsAble((element, attributes) => {
    editor.elementsCollection?.update(element.id, {
      attributes,
      updatedAt: Date.now(),
    });
  });

  let moveable = $state.raw<MoveableType>();

  type TempStyle = { value: string; priority: string };
  type GestureTarget = {
    target: HTMLElement | SVGElement;
    element: ElementRecord;
    rect: DOMRect;
    startLeft: number;
    startTop: number;
    startWidth: number;
    startHeight: number;
    position: string;
    tempStyles: Map<string, TempStyle>;
    dragX: number;
    dragY: number;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  };

  type Gesture = {
    kind: "drag" | "resize" | "scale" | "rotate";
    states: GestureTarget[];
  };

  let gesture: Gesture | null = null;

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
      origin: false,
      edge: false,
      throttleDrag: 0,
      throttleResize: 0,
      throttleScale: 0,
      throttleRotate: 0,
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

  function targetSize(target: HTMLElement | SVGElement) {
    if (target instanceof SVGGraphicsElement) {
      const box = target.getBBox();
      return { width: box.width, height: box.height };
    }
    return {
      width: (target as HTMLElement).offsetWidth,
      height: (target as HTMLElement).offsetHeight,
    };
  }

  function createStates(): GestureTarget[] {
    return targets.flatMap((target, index) => {
      const element = selectedElements[index];
      if (!element) return [];
      const computed = getComputedStyle(target);
      const rect = target.getBoundingClientRect();
      const support = moveableSupportForElement(element);
      const size =
        support.resizable || support.scalable ? targetSize(target) : { width: 0, height: 0 };
      const left = Number.parseFloat(computed.left);
      const top = Number.parseFloat(computed.top);

      return {
        target,
        element,
        rect,
        startLeft: Number.isFinite(left) ? left : (target as HTMLElement).offsetLeft || 0,
        startTop: Number.isFinite(top) ? top : (target as HTMLElement).offsetTop || 0,
        startWidth: size.width,
        startHeight: size.height,
        position: computed.position,
        tempStyles: new Map(),
        dragX: 0,
        dragY: 0,
        width: size.width,
        height: size.height,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      };
    });
  }

  function setTempStyle(state: GestureTarget, property: string, value: string) {
    if (!state.tempStyles.has(property)) {
      state.tempStyles.set(property, {
        value: state.target.style.getPropertyValue(property),
        priority: state.target.style.getPropertyPriority(property),
      });
    }
    state.target.style.setProperty(property, value);
  }

  function restoreTempStyles(
    states: GestureTarget[],
    changes: Map<string, Partial<ElementRecord>>,
  ) {
    for (const state of states) {
      const committedStyle = changes.get(state.element.id)?.style;
      for (const [property, original] of state.tempStyles) {
        if (committedStyle && property in committedStyle) continue;
        if (original.value) {
          state.target.style.setProperty(property, original.value, original.priority);
        } else {
          state.target.style.removeProperty(property);
        }
      }
    }
  }

  function mergeStyle(element: ElementRecord, patch: ElementStyle): ElementStyle {
    return { ...element.style, ...patch };
  }

  function shiftedTranslate(element: ElementRecord, dx: number, dy: number) {
    const current = element.style.transform?.trim();
    const match = current?.match(
      /^translate\(([-+]?\d*\.?\d+)(?:px)?,\s*([-+]?\d*\.?\d+)(?:px)?\)$/,
    );
    if (!match) return `translate(${dx}px, ${dy}px)`;
    return `translate(${Number.parseFloat(match[1]) + dx}px, ${Number.parseFloat(match[2]) + dy}px)`;
  }

  function mergeAttributes(element: ElementRecord, patch: ElementAttributes): ElementAttributes {
    return { ...element.attributes, ...patch };
  }

  async function commitChanges(
    states: GestureTarget[],
    changes: Map<string, Partial<ElementRecord>>,
  ) {
    if (changes.size === 0) {
      restoreTempStyles(states, changes);
      gesture = null;
      return;
    }

    editor.elementsCollection?.updateMany(
      [...changes].map(([id, change]) => ({
        id,
        changes: { ...change, updatedAt: Date.now() },
      })),
    );

    await tick();
    restoreTempStyles(states, changes);
    gesture = null;
  }

  function screenDeltaToSvg(target: HTMLElement | SVGElement, dx: number, dy: number) {
    if (!(target instanceof SVGElement)) return { dx, dy };
    const svg = getSvgCreatePointRoot(target);
    const matrix = getSvgScreenCTM(target);
    if (!svg || !matrix) return { dx, dy };
    const inverse = matrix.inverse();
    const start = svg.createSVGPoint();
    const end = svg.createSVGPoint();
    start.x = 0;
    start.y = 0;
    end.x = dx;
    end.y = dy;
    const startSvg = start.matrixTransform(inverse);
    const endSvg = end.matrixTransform(inverse);
    return { dx: endSvg.x - startSvg.x, dy: endSvg.y - startSvg.y };
  }

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

  function commitDrag(dx: number, dy: number) {
    if (!gesture || gesture.kind !== "drag") return;
    const states = gesture.states;
    const changes = new Map<string, Partial<ElementRecord>>();
    const staticStates: GestureTarget[] = [];

    for (const state of states) {
      if (state.element.kind === "svg") {
        const delta = screenDeltaToSvg(state.target, dx, dy);
        const attributes = svgDragAttributes(state.element, delta.dx, delta.dy);
        if (attributes) {
          changes.set(state.element.id, { attributes });
        } else {
          changes.set(state.element.id, {
            style: mergeStyle(state.element, {
              transform: shiftedTranslate(state.element, delta.dx, delta.dy),
            }),
          });
        }
      } else if (state.position === "absolute" || state.position === "fixed") {
        changes.set(state.element.id, {
          style: mergeStyle(state.element, {
            left: `${state.startLeft + dx}px`,
            top: `${state.startTop + dy}px`,
          }),
        });
      } else {
        staticStates.push(state);
      }
    }

    applyStaticReorder(staticStates, dx, dy, changes);
    void commitChanges(states, changes);
  }

  function onDragStart() {
    gesture = { kind: "drag", states: createStates() };
  }

  function applyDrag(dx: number, dy: number) {
    if (!gesture || gesture.kind !== "drag") return;
    for (const state of gesture.states) {
      state.dragX = dx;
      state.dragY = dy;
      if (state.element.kind === "svg") {
        setTempStyle(state, "transform", `translate(${dx}px, ${dy}px)`);
      } else if (state.position === "absolute" || state.position === "fixed") {
        setTempStyle(state, "left", `${state.startLeft + dx}px`);
        setTempStyle(state, "top", `${state.startTop + dy}px`);
      } else {
        setTempStyle(state, "transform", `translate(${dx}px, ${dy}px)`);
      }
    }
  }

  function onDrag(event: OnDrag) {
    applyDrag(event.dist[0], event.dist[1]);
  }

  function onDragGroup(event: OnDragGroup) {
    applyDrag(event.dist[0], event.dist[1]);
  }

  function onDragEnd() {
    if (!gesture) return;
    const first = gesture.states[0];
    if (first) commitDrag(first.dragX, first.dragY);
  }

  function onDragGroupEnd() {
    if (!gesture) return;
    const first = gesture.states[0];
    if (first) commitDrag(first.dragX, first.dragY);
  }

  function onResizeStart() {
    gesture = { kind: "resize", states: createStates() };
  }

  function applyResize(event: OnResize, index: number) {
    const state = gesture?.states[index];
    if (!state) return;

    setTempStyle(state, "width", `${event.width}px`);
    setTempStyle(state, "height", `${event.height}px`);
    let x = "left";
    let y = "top";

    if (state.element.kind === "svg") {
      ((x = "x"), (y = "y"));
    }
    setTempStyle(state, x, `${event.drag.left}px`);
    setTempStyle(state, y, `${event.drag.top}px`);
  }

  function onResize(event: OnResize) {
    applyResize(event, 0);
  }

  function onResizeGroup(event: OnResizeGroup) {
    event.events.forEach((child, index) => applyResize(child, index));
  }

  function commitResize() {
    if (!gesture || gesture.kind !== "resize") return;
    const changes = new Map<string, Partial<ElementRecord>>();
    for (const state of gesture.states) {
      if (state.element.kind === "svg") {
        const attributes = svgScaleAttributes(
          state.element,
          state.startWidth,
          state.startHeight,
          state.startWidth === 0 ? 1 : state.width / state.startWidth,
          state.startHeight === 0 ? 1 : state.height / state.startHeight,
        );
        if (attributes) {
          const hasStyledSize =
            state.element.style.width !== undefined || state.element.style.height !== undefined;
          changes.set(state.element.id, {
            attributes,
            ...(hasStyledSize
              ? {
                  style: mergeStyle(state.element, {
                    width: `${state.width}px`,
                    height: `${state.height}px`,
                  }),
                }
              : {}),
          });
          continue;
        }
      }
      changes.set(state.element.id, {
        style: mergeStyle(state.element, {
          width: `${state.width}px`,
          height: `${state.height}px`,
        }),
      });
    }
    void commitChanges(gesture.states, changes);
  }

  function onResizeEnd() {
    commitResize();
  }

  function onResizeGroupEnd() {
    commitResize();
  }

  function onScaleStart() {
    gesture = { kind: "scale", states: createStates() };
  }

  function applyScale(event: OnScale, index: number) {
    const state = gesture?.states[index];
    if (!state) return;
    state.scaleX = event.scale[0];
    state.scaleY = event.scale[1];
    setTempStyle(state, "transform", `scale(${state.scaleX}, ${state.scaleY})`);
  }

  function onScale(event: OnScale) {
    applyScale(event, 0);
  }

  function onScaleGroup(event: OnScaleGroup) {
    event.events.forEach((child, index) => applyScale(child, index));
  }

  function commitScale() {
    if (!gesture || gesture.kind !== "scale") return;
    const changes = new Map<string, Partial<ElementRecord>>();
    for (const state of gesture.states) {
      const attributes = svgScaleAttributes(
        state.element,
        state.startWidth,
        state.startHeight,
        state.scaleX,
        state.scaleY,
      );
      if (attributes) {
        changes.set(state.element.id, { attributes });
      } else {
        changes.set(state.element.id, {
          style: mergeStyle(state.element, {
            scale: `${state.scaleX} ${state.scaleY}`,
          }),
        });
      }
    }
    void commitChanges(gesture.states, changes);
  }

  function onScaleEnd() {
    commitScale();
  }

  function onScaleGroupEnd() {
    commitScale();
  }

  function onRotateStart() {
    gesture = { kind: "rotate", states: createStates() };
  }

  function applyRotate(event: OnRotate, index: number) {
    const state = gesture?.states[index];
    if (!state) return;
    state.rotation = event.rotation;
    setTempStyle(state, "rotate", `${event.rotation}deg`);
  }

  function onRotate(event: OnRotate) {
    applyRotate(event, 0);
  }

  function onRotateGroup(event: OnRotateGroup) {
    event.events.forEach((child, index) => applyRotate(child, index));
  }

  function commitRotate() {
    if (!gesture || gesture.kind !== "rotate") return;
    const changes = new Map<string, Partial<ElementRecord>>();
    for (const state of gesture.states) {
      changes.set(state.element.id, {
        style: mergeStyle(state.element, { rotate: `${state.rotation}deg` }),
      });
    }
    void commitChanges(gesture.states, changes);
  }

  function onRotateEnd() {
    commitRotate();
  }

  function onRotateGroupEnd() {
    commitRotate();
  }

  $effect(() => {
    void targets;
    void selectedElements;
    void canvasElement;
    moveable?.setState(moveableOptions(), () => {
      moveable?.updateRect();
    });
  });

  onMount(() => {
    let disposed = false;
    let instance: MoveableType | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let frame = 0;

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
      canvasElement?.removeEventListener("scroll", syncRect);
      window.removeEventListener("resize", syncRect);
      resizeObserver?.disconnect();
      instance?.destroy();
      moveable = undefined;
    };
  });
</script>
