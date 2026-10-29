import { describe, expect, it, vi } from "vitest";
import { createEventSnapshot } from "$lib/client/editor/script/eventSnapshot";

function fakeEvent(overrides: Record<string, unknown> = {}): Event {
  return {
    type: "click",
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    isTrusted: true,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    target: null,
    currentTarget: null,
    ...overrides,
  } as unknown as Event;
}

describe("createEventSnapshot", () => {
  it("copies safe event fields", () => {
    const snapshot = createEventSnapshot(
      fakeEvent({
        type: "keydown",
        key: "Enter",
        code: "Enter",
        repeat: true,
        altKey: true,
        ctrlKey: true,
        shiftKey: true,
        metaKey: true,
      }),
    );

    expect(snapshot.type).toBe("keydown");
    expect(snapshot.key).toBe("Enter");
    expect(snapshot.code).toBe("Enter");
    expect(snapshot.repeat).toBe(true);
    expect(snapshot.altKey).toBe(true);
    expect(snapshot.ctrlKey).toBe(true);
    expect(snapshot.shiftKey).toBe(true);
    expect(snapshot.metaKey).toBe(true);
  });

  it("copies a safe target snapshot", () => {
    const snapshot = createEventSnapshot(
      fakeEvent({
        target: {
          tagName: "INPUT",
          id: "name",
          name: "name",
          type: "text",
          value: "Ada",
          checked: false,
          ownerDocument: {},
        },
      }),
    );

    expect(snapshot.target).toEqual({
      tagName: "input",
      id: "name",
      name: "name",
      type: "text",
      value: "Ada",
      checked: false,
    });
    expect(snapshot.target).not.toHaveProperty("ownerDocument");
  });

  it("masks password input values", () => {
    const snapshot = createEventSnapshot(
      fakeEvent({
        target: {
          tagName: "INPUT",
          type: "password",
          value: "hunter2",
        },
      }),
    );

    expect(snapshot.target?.value).toBeNull();
    expect(snapshot.target?.type).toBe("password");
  });

  it("does not expose window, composedPath, or relatedTarget", () => {
    const snapshot = createEventSnapshot(
      fakeEvent({
        view: { document: {} },
        composedPath: () => [],
        relatedTarget: {},
      }),
    );

    expect(snapshot).not.toHaveProperty("view");
    expect(snapshot).not.toHaveProperty("composedPath");
    expect(snapshot).not.toHaveProperty("relatedTarget");
  });

  it("forwards preventDefault and propagation calls to the original event", () => {
    const event = fakeEvent();
    const snapshot = createEventSnapshot(event);

    snapshot.preventDefault();
    snapshot.stopPropagation();
    snapshot.stopImmediatePropagation();

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });
});
