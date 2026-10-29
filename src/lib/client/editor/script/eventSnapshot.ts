import type { ScriptEvent, ScriptEventTarget } from "./scriptApi";

function read(source: object, key: string): unknown {
  return (source as Record<string, unknown>)[key];
}

function numberOr(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function booleanOr(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function targetSnapshot(target: EventTarget | null): ScriptEventTarget | null {
  if (!target || typeof target !== "object") return null;

  const tagName = stringOr(read(target, "tagName")).toLowerCase();
  const type = stringOr(read(target, "type"));
  const isPassword = tagName === "input" && type.toLowerCase() === "password";
  const rawValue = isPassword ? null : read(target, "value");
  const value =
    typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean"
      ? rawValue
      : null;
  const checked = read(target, "checked");

  return {
    tagName,
    id: stringOr(read(target, "id")),
    name: stringOr(read(target, "name")),
    type,
    value,
    checked: typeof checked === "boolean" ? checked : null,
  };
}

export function createEventSnapshot(event: Event): ScriptEvent {
  return {
    type: event.type,
    key: stringOr(read(event, "key")),
    code: stringOr(read(event, "code")),
    repeat: booleanOr(read(event, "repeat")),
    button: numberOr(read(event, "button")),
    buttons: numberOr(read(event, "buttons")),
    clientX: numberOr(read(event, "clientX")),
    clientY: numberOr(read(event, "clientY")),
    pageX: numberOr(read(event, "pageX")),
    pageY: numberOr(read(event, "pageY")),
    screenX: numberOr(read(event, "screenX")),
    screenY: numberOr(read(event, "screenY")),
    deltaX: numberOr(read(event, "deltaX")),
    deltaY: numberOr(read(event, "deltaY")),
    deltaMode: numberOr(read(event, "deltaMode")),
    detail: numberOr(read(event, "detail")),
    pointerType: stringOr(read(event, "pointerType")),
    isTrusted: booleanOr(read(event, "isTrusted")),
    altKey: booleanOr(read(event, "altKey")),
    ctrlKey: booleanOr(read(event, "ctrlKey")),
    shiftKey: booleanOr(read(event, "shiftKey")),
    metaKey: booleanOr(read(event, "metaKey")),
    target: targetSnapshot(event.target),
    currentTarget: targetSnapshot(event.currentTarget),
    preventDefault: () => event.preventDefault(),
    stopPropagation: () => event.stopPropagation(),
    stopImmediatePropagation: () => event.stopImmediatePropagation(),
  };
}
