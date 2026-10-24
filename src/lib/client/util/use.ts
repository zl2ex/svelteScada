export function focusOnMount(node: HTMLInputElement) {
  node.focus();
  requestAnimationFrame(() => node.select());
}
