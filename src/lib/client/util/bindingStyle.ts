export const boundFieldStyle =
  "background-color: color-mix(in oklab, var(--color-primary-300-700) 30%, transparent)";

export const boundTooltip = "Field Bound";
/**
 * Returns the style string for a bound field.
 *
 * @param bound - indicating whether the field is bound
 * @returns the bound-field style when bound, otherwise an empty string
 */
export function boundStyle(bound: boolean) {
  return bound ? boundFieldStyle : "";
}
