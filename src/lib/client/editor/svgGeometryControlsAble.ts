import type { Able, Renderer } from "moveable";
import type { ElementAttributes, ElementRecord } from "$lib/elements/elementTypes";
import {
  applySvgGeometryControlDrag,
  clientPointToSvg,
  getSvgCreatePointRoot,
  getSvgGeometryControls,
  getSvgScreenCTM,
  type SvgGeometryControl,
} from "./svgGeometryControls";

export type SvgGeometryControlCommit = (
  element: ElementRecord,
  attributes: ElementAttributes,
  baseAttributes: ElementAttributes,
) => void;

export type SvgGeometryControlHandlers = {
  preview: SvgGeometryControlCommit;
  commit: SvgGeometryControlCommit;
};

type ActiveDrag = {
  target: SVGElement;
  element: ElementRecord;
  control: SvgGeometryControl;
  baseAttributes: ElementAttributes;
  previewAttributes: ElementAttributes | null;
};

/**
 * Creates a Moveable able that renders and drags SVG geometry control handles.
 *
 * @param handlers - Preview and commit callbacks for geometry changes
 * @returns The Moveable able definition
 */
export function createSvgGeometryControlsAble({ preview, commit }: SvgGeometryControlHandlers) {
  return {
    name: "svgGeometryControls",
    always: true,
    /**
     * Checks whether a drag should start on an SVG geometry control.
     *
     * @param _moveable - Moveable instance (unused)
     * @param e - Moveable drag event
     * @returns True when the input target is a geometry control
     */
    dragControlCondition(_moveable: any, e: any) {
      const target = e.inputEvent?.target;
      return target instanceof Element && !!target.closest("[data-svg-control]");
    },
    /**
     * Captures the control and base attributes when a geometry drag starts.
     *
     * @param moveable - Moveable instance owning the target element
     * @param e - Moveable drag event
     * @returns True when the drag was initialized
     */
    dragControlStart(moveable: any, e: any) {
      const inputTarget = e.inputEvent?.target;
      const controlElement =
        inputTarget instanceof Element
          ? inputTarget.closest<HTMLElement>("[data-svg-control]")
          : null;
      const key = controlElement?.dataset.svgControl;
      const element = moveable.props.svgGeometryElement as ElementRecord | null | undefined;
      const target = moveable.state.target;

      if (!key || !element || element.kind !== "svg" || !(target instanceof SVGElement)) {
        return false;
      }

      const control = getSvgGeometryControls(element, element.attributes, target).find(
        (item) => item.key === key,
      );
      if (!control) return false;

      e.datas.svgControl = {
        target,
        element,
        control,
        baseAttributes: { ...element.attributes },
        previewAttributes: null,
      } satisfies ActiveDrag;
      return true;
    },
    /**
     * Previews updated attributes as a geometry control is dragged.
     *
     * @param _moveable - Moveable instance (unused)
     * @param e - Moveable drag event
     * @returns True when the attributes were updated
     */
    dragControl(_moveable: any, e: any) {
      const active = e.datas.svgControl as ActiveDrag | undefined;
      if (!active) return false;

      const point = clientPointToSvg(active.target, e.clientX, e.clientY);
      if (!point) return false;

      const attributes = applySvgGeometryControlDrag(
        active.element,
        active.baseAttributes,
        active.control,
        point,
        active.target,
      );
      if (!attributes) return false;

      active.previewAttributes = attributes;
      preview(active.element, attributes, active.baseAttributes);
      return true;
    },
    /**
     * Commits the previewed attributes when a geometry drag ends.
     *
     * @param moveable - Moveable instance owning the target element
     * @param e - Moveable drag event
     * @returns True when a previewed change was committed
     */
    dragControlEnd(moveable: any, e: any) {
      const dragged = e.datas.svgControl as ActiveDrag | undefined;
      delete e.datas.svgControl;

      if (!dragged?.previewAttributes) return false;

      commit(dragged.element, dragged.previewAttributes, dragged.baseAttributes);
      moveable.updateRect?.();
      return true;
    },
    /**
     * Renders a positioned control handle for each supported geometry control.
     *
     * @param moveable - Moveable instance owning the target element
     * @param renderer - Moveable renderer used to create elements
     * @returns The rendered control elements, or an empty array when unsupported
     */
    render(moveable: any, renderer: Renderer) {
      const element = moveable.props.svgGeometryElement as ElementRecord | null | undefined;
      const target = moveable.state.target;

      if (!element || element.kind !== "svg" || !(target instanceof SVGElement)) return [];

      const controls = getSvgGeometryControls(element, element.attributes, target);
      if (controls.length === 0) return [];

      const svg = getSvgCreatePointRoot(target);
      const matrix = getSvgScreenCTM(target);
      if (!svg || !matrix) return [];

      const targetRect = target.getBoundingClientRect();

      return controls.map((control) => {
        const point = svg.createSVGPoint();
        point.x = control.x;
        point.y = control.y;
        const screen = point.matrixTransform(matrix);

        return renderer.createElement("div", {
          key: control.key,
          className:
            "moveable-control moveable-svg-control" +
            (control.kind === "center" ? " moveable-svg-center" : ""),
          "data-svg-control": control.key,
          title: control.label,
          "aria-label": control.label,
          style: {
            left: `${screen.x - targetRect.left}px`,
            top: `${screen.y - targetRect.top}px`,
            cursor: control.cursor,
            pointerEvents: "auto",
            touchAction: "none",
          },
        });
      });
    },
  } satisfies Able;
}
