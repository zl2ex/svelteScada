import { goto } from "$app/navigation";
import { toast } from "$lib/client/toast.svelte";
import type { TagMapEntry, TagMapStatus } from "$lib/client/live/tagMap.svelte";
import type { ElementAttributes, ElementRecord } from "$lib/page/elementTypes";
import type { TagValue } from "$lib/server/tag/tag";
import { errorToString, type NeverThrowError, type WireResult } from "$lib/util/neverThrow";

export type TagRead = (lookup: string) => TagMapEntry | undefined;
export type TagStatusRead = (lookup: string) => TagMapStatus;
export type TagWrite = (
  lookup: string,
  value: TagValue,
) => Promise<WireResult<{ success: true }, NeverThrowError>>;

export type BindingContext = {
  tag: TagRead;
  tagStatus: TagStatusRead;
  props: ElementAttributes;
  element: ElementRecord;
};

export type EventContext = BindingContext & {
  event: Event;
  writeTag: TagWrite;
};

type CompiledExpression = (
  tag: TagRead,
  tagStatus: TagStatusRead,
  props: ElementAttributes,
  element: ElementRecord,
) => unknown;

type CompiledEvent = (
  event: Event,
  tag: TagRead,
  tagStatus: TagStatusRead,
  writeTag: TagWrite,
  gotoFn: typeof goto,
  toastFn: typeof toast,
  props: ElementAttributes,
  element: ElementRecord,
) => Promise<unknown>;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as {
  new (...args: string[]): CompiledEvent;
};

const expressionCache = new Map<string, CompiledExpression | null>();
const eventCache = new Map<string, CompiledEvent | null>();

function compileExpression(expression: string): CompiledExpression | null {
  const cached = expressionCache.get(expression);
  if (cached !== undefined) return cached;

  try {
    const compiled = new Function(
      "tag",
      "tagStatus",
      "props",
      "element",
      `"use strict"; return (${expression});`,
    ) as CompiledExpression;
    expressionCache.set(expression, compiled);
    return compiled;
  } catch (error) {
    console.error(`[element binding] could not compile "${expression}"`, error);
    expressionCache.set(expression, null);
    return null;
  }
}

function compileEvent(script: string): CompiledEvent | null {
  const cached = eventCache.get(script);
  if (cached !== undefined) return cached;

  try {
    const compiled = new AsyncFunction(
      "event",
      "tag",
      "tagStatus",
      "writeTag",
      "goto",
      "toast",
      "props",
      "element",
      `"use strict";\n${script}`,
    );
    eventCache.set(script, compiled);
    return compiled;
  } catch (error) {
    console.error(`[element event] could not compile`, error);
    eventCache.set(script, null);
    return null;
  }
}

export function evaluateExpression(expression: string, context: BindingContext) {
  if (!expression.trim()) return undefined;
  const compiled = compileExpression(expression);
  if (!compiled) return undefined;
  try {
    return compiled(context.tag, context.tagStatus, context.props, context.element);
  } catch (error) {
    console.error(`[element binding] "${expression}" threw`, error);
    return undefined;
  }
}

export async function runEventScript(script: string, context: EventContext) {
  if (!script.trim()) return;
  const compiled = compileEvent(script);
  if (!compiled) return;

  try {
    await compiled(
      context.event,
      context.tag,
      context.tagStatus,
      context.writeTag,
      goto,
      toast,
      context.props,
      context.element,
    );
  } catch (error) {
    console.error(`[element event] "${script}" threw`, error);
    toast({
      kind: "error",
      title: "Event script error",
      description: errorToString(error),
      duration: 4000,
    });
  }
}
