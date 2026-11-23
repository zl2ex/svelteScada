export const boundFieldStyle =
  "background-color: light-dark(var(--color-primary-100), var(--color-primary-900))";

export function fieldStyle(view: { bound: boolean }) {
  return view.bound ? boundFieldStyle : "";
}
