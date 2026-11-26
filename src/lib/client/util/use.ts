export { commitOrRevert, type CommitOrRevertOptions } from "./commitOrRevert";

export function focusOnMount(
  node: HTMLInputElement | HTMLTextAreaElement,
  disabled: boolean = false,
) {
  if (disabled) return;
  node.focus();
  requestAnimationFrame(() => node.select());
}
