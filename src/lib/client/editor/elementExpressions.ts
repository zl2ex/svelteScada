import { goto } from "$app/navigation";
import { toast } from "$lib/client/toast.svelte";
import type { ElementAttributes, ElementRecord } from "$lib/elements/elementTypes";
import type { TagValue } from "$lib/server/tag/tag";
import type { ScriptEvent } from "$lib/client/editor/script/scriptApi";
import {
  executeSandboxEvent,
  type SandboxElementBindingScope,
} from "$lib/client/editor/script/scriptSandbox";
import {
  createBindingScope,
  evaluateExpression as evaluateContextExpression,
  type BindingContext as CommonBindingContext,
} from "$lib/client/editor/expressions";
import { errorToString, type NeverThrowError, type WireResult } from "$lib/util/neverThrow";

export type GotoFn = typeof goto;
export type ToastFn = typeof toast;
export type TagWrite = (
  lookup: string,
  value: TagValue,
) => Promise<WireResult<{ success: true }, NeverThrowError>>;

export type BindingContext = CommonBindingContext & {
  props: ElementAttributes;
  element: ElementRecord;
};

export type EventContext = BindingContext & {
  event: ScriptEvent;
  writeTag: TagWrite;
};

export function evaluateExpression(expression: string, context: BindingContext) {
  return evaluateContextExpression(expression, context);
}

export async function runEventScript(script: string, context: EventContext) {
  if (!script.trim()) return;

  const { event, writeTag, ...bindingContext } = context;
  const scope = createBindingScope(bindingContext) as SandboxElementBindingScope;
  const result = await executeSandboxEvent(script, {
    ...scope,
    event,
    writeTag: (lookup, value) => writeTag(lookup, value as TagValue),
    goto: (url, options) => goto(url, options as Parameters<GotoFn>[1]),
    toast: (message) => toast(message as Parameters<ToastFn>[0]),
  });

  if (result.isErr) {
    toast({
      kind: "error",
      title: "Event script error",
      description: errorToString(result.error),
      duration: 4000,
    });
  }
}
