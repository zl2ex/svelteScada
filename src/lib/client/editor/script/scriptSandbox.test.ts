import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EVENT_SCRIPT_TIMEOUT_MS,
  evaluateSandboxExpression,
  executeSandboxEvent,
  type SandboxBindingScope,
  type SandboxEventScope,
} from "$lib/client/editor/script/scriptSandbox";
import type { ScriptEvent } from "$lib/client/editor/script/scriptApi";

function bindingScope(overrides: Partial<SandboxBindingScope> = {}): SandboxBindingScope {
  return {
    tag: () => undefined,
    tagValue: () => undefined,
    tagStatus: () => "missing",
    props: {},
    element: {},
    ...overrides,
  };
}

function eventSnapshot(overrides: Partial<ScriptEvent> = {}): ScriptEvent {
  return {
    type: "click",
    key: "",
    code: "",
    repeat: false,
    button: 0,
    buttons: 0,
    clientX: 0,
    clientY: 0,
    pageX: 0,
    pageY: 0,
    screenX: 0,
    screenY: 0,
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    detail: 0,
    pointerType: "",
    isTrusted: true,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    target: null,
    currentTarget: null,
    preventDefault: () => {},
    stopPropagation: () => {},
    stopImmediatePropagation: () => {},
    ...overrides,
  };
}

function eventScope(
  event: ScriptEvent,
  overrides: Partial<SandboxEventScope> = {},
): SandboxEventScope {
  return {
    ...bindingScope(),
    event,
    writeTag: async () => ({ isErr: false, isOk: true, value: { success: true } }),
    goto: async () => {},
    toast: () => {},
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("expression sandbox", () => {
  it("evaluates expressions against the provided scope", () => {
    const result = evaluateSandboxExpression('tagValue("tag").value * 2 + props.offset', {
      ...bindingScope(),
      tagValue: (lookup) => (lookup === "tag" ? { value: 5 } : undefined),
      props: { offset: 1 },
    });

    expect(result).toBe(11);
  });

  it("returns undefined when the expression does not compile", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(evaluateSandboxExpression("1 +", bindingScope())).toBeUndefined();
  });

  it("returns undefined when the expression throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(evaluateSandboxExpression("missing.value", bindingScope())).toBeUndefined();
  });

  it("does not expose browser globals even when the host has them", () => {
    const host = globalThis as Record<string, unknown>;
    host.window = { secret: "window" };
    host.document = { cookie: "secret" };
    host.fetch = async () => "secret";
    host.localStorage = { getItem: () => "secret" };
    host.indexedDB = {};
    host.XMLHttpRequest = class {};
    host.WebSocket = class {};
    host.process = { env: { SECRET: "secret" } };

    try {
      expect(evaluateSandboxExpression("typeof window", bindingScope())).toBe("undefined");
      expect(evaluateSandboxExpression("typeof document", bindingScope())).toBe("undefined");
      expect(evaluateSandboxExpression("typeof fetch", bindingScope())).toBe("undefined");
      expect(evaluateSandboxExpression("typeof localStorage", bindingScope())).toBe("undefined");
      expect(evaluateSandboxExpression("typeof indexedDB", bindingScope())).toBe("undefined");
      expect(evaluateSandboxExpression("typeof XMLHttpRequest", bindingScope())).toBe("undefined");
      expect(evaluateSandboxExpression("typeof WebSocket", bindingScope())).toBe("undefined");
      expect(evaluateSandboxExpression("typeof process", bindingScope())).toBe("undefined");
    } finally {
      delete host.window;
      delete host.document;
      delete host.fetch;
      delete host.localStorage;
      delete host.indexedDB;
      delete host.XMLHttpRequest;
      delete host.WebSocket;
      delete host.process;
    }
  });

  it("blocks constructor-chain escapes", () => {
    expect(
      evaluateSandboxExpression(
        '({}).constructor.constructor("return typeof window")()',
        bindingScope(),
      ),
    ).toBe("undefined");
  });

  it("enforces an execution quota for infinite loops", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const started = Date.now();

    expect(evaluateSandboxExpression("(() => { while (true) {} })()", bindingScope())).toBe(
      undefined,
    );
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("resets the quota between evaluations", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(evaluateSandboxExpression("(() => { while (true) {} })()", bindingScope())).toBe(
      undefined,
    );
    expect(evaluateSandboxExpression("1 + 1", bindingScope())).toBe(2);
  });
});

describe("event sandbox", () => {
  it("runs async scripts and awaits host functions", async () => {
    const writeTag = vi.fn(async () => ({ isErr: false, isOk: true, value: { success: true } }));
    const toast = vi.fn();

    const result = await executeSandboxEvent(
      'const written = await writeTag("tag", 7); toast(written.value); return written.isOk;',
      eventScope(eventSnapshot(), { writeTag, toast }),
    );

    expect(result.isErr).toBe(false);
    expect(result.isOk && result.data).toBe(true);
    expect(writeTag).toHaveBeenCalledWith("tag", 7);
    expect(toast).toHaveBeenCalledWith({ success: true });
  });

  it("exposes the sanitized event object", async () => {
    const result = await executeSandboxEvent(
      "return [event.type, event.key, event.target?.value, event.target?.ownerDocument];",
      eventScope(
        eventSnapshot({
          type: "keydown",
          key: "Enter",
          target: {
            tagName: "input",
            id: "name",
            name: "name",
            type: "text",
            value: "Ada",
            checked: null,
          },
        }),
      ),
    );

    expect(result.isErr).toBe(false);
    expect(result.isOk && result.data).toEqual(["keydown", "Enter", "Ada", undefined]);
  });

  it("forwards event methods through the sandbox", async () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    const result = await executeSandboxEvent(
      "event.preventDefault(); event.stopPropagation();",
      eventScope(eventSnapshot({ preventDefault, stopPropagation })),
    );

    expect(result.isErr).toBe(false);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("returns an error for invalid scripts", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await executeSandboxEvent("const = ;", eventScope(eventSnapshot()));
    expect(result.isErr).toBe(true);
  });

  it("returns an error when the script throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await executeSandboxEvent('throw new Error("boom")', eventScope(eventSnapshot()));
    expect(result.isErr).toBe(true);
  });

  it("times out scripts waiting on a host promise", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const started = Date.now();

    const result = await executeSandboxEvent(
      "await writeTag(\"tag\", 1);",
      eventScope(eventSnapshot(), {
        writeTag: () => new Promise(() => {}),
      }),
      50,
    );

    expect(result.isErr).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("exposes the default timeout", () => {
    expect(EVENT_SCRIPT_TIMEOUT_MS).toBe(2000);
  });
});
