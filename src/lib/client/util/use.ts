export { commitOrRevert, type CommitOrRevertOptions } from "./commitOrRevert";

/**
 * Focuses and selects an input when it mounts.
 *
 * @param node - input or textarea element to focus
 * @param [disabled] - skip focusing when true (defaults to false)
 */
export function focusOnMount(
  node: HTMLInputElement | HTMLTextAreaElement,
  disabled: boolean = false,
) {
  if (disabled) return;
  node.focus();
  requestAnimationFrame(() => node.select());
}
