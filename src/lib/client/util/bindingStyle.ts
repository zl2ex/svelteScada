export const boundFieldStyle =
  "background-color: light-dark(var(--color-primary-100), var(--color-primary-900))";

/**
 * Returns the style string for a bound field.
 *
 * @param view - view state indicating whether the field is bound
 * @returns the bound-field style when bound, otherwise an empty string
 */
export function fieldStyle(view: { bound: boolean }) {
  return view.bound ? boundFieldStyle : "";
}
