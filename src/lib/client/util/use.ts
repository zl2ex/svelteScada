export function focusOnMount(node: HTMLInputElement) {
  node.focus();
  requestAnimationFrame(() => node.select());
}

export function commitOrRevert(node: HTMLInputElement, commit: Function, revert: Function) {
  node.addEventListener("keyup", (ev) => {
    if (ev.key === "Enter") node.blur();
    if (ev.key === "Escape") revert?.();
  });

  node.addEventListener("blur", (ev) => commit?.(ev));
}
