export const MIN_CANVAS_ZOOM = 0.25;
export const MAX_CANVAS_ZOOM = 2;
export const CANVAS_ZOOM_STEP = 0.1;

export function clampCanvasZoom(value: number) {
  return Math.min(
    MAX_CANVAS_ZOOM,
    Math.max(MIN_CANVAS_ZOOM, Math.round(value * 100) / 100),
  );
}

export function stepCanvasZoom(current: number, direction: -1 | 1) {
  return clampCanvasZoom(current + direction * CANVAS_ZOOM_STEP);
}
