export const MIN_CANVAS_ZOOM = 0.25;
export const MAX_CANVAS_ZOOM = 10;
export const CANVAS_ZOOM_STEP = 0.01;

/**
 * Clamps a zoom factor to the supported range and rounds to two decimals.
 * @param value - Zoom factor to clamp.
 * @returns The clamped zoom factor.
 */
export function clampCanvasZoom(value: number) {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, Math.round(value * 100) / 100));
}

/**
 * Advances the zoom by one adaptive step in the given direction.
 * @param current - Current zoom factor.
 * @param direction - Step direction.
 * @returns The clamped zoom factor after the step.
 */
export function stepCanvasZoom(current: number, direction: -1 | 1) {
  return clampCanvasZoom(current + direction * CANVAS_ZOOM_STEP * (Math.pow(current, 2) + 0.5));
}
