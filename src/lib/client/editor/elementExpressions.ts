import { goto } from "$app/navigation";
import { toast } from "$lib/client/toast.svelte";
import type { TagMapEntry, TagMapStatus } from "$lib/client/live/tagMap.svelte";
import type { ElementAttributes, ElementRecord } from "$lib/page/elementTypes";
import type { ClientTagValue, TagValue } from "$lib/server/tag/tag";
import type { ScriptEvent } from "$lib/client/editor/script/scriptApi";
import {
  evaluateSandboxExpression,
  executeSandboxEvent,
  type SandboxBindingScope,
} from "$lib/client/editor/script/scriptSandbox";
import { clonePlain } from "$lib/client/editor/script/plainData";
import { errorToString, type NeverThrowError, type WireResult } from "$lib/util/neverThrow";

export type GotoFn = typeof goto;
export type ToastFn = typeof toast;
export type TagRead = (lookup: string) => TagMapEntry | undefined;
export type TagValueRead = (lookup: string) => ClientTagValue | undefined;
export type TagStatusRead = (lookup: string) => TagMapStatus;
export type TagWrite = (
  lookup: string,
  value: TagValue,
) => Promise<WireResult<{ success: true }, NeverThrowError>>;

export type BindingContext = {
  tag: TagRead;
  tagValue: TagValueRead;
  tagStatus: TagStatusRead;
  props: ElementAttributes;
  element: ElementRecord;
};

export type EventContext = BindingContext & {
  event: ScriptEvent;
  writeTag: TagWrite;
};

function bindingScope(context: BindingContext): SandboxBindingScope {
  return {
    tag: (lookup) => clonePlain(context.tag(lookup)),
    tagValue: (lookup) => clonePlain(context.tagValue(lookup)),
    tagStatus: (lookup) => context.tagStatus(lookup),
    props: clonePlain(context.props) as Record<string, unknown>,
    element: clonePlain(context.element) as Record<string, unknown>,
  };
}

export function evaluateExpression(expression: string, context: BindingContext) {
  if (!expression.trim()) return undefined;
  return evaluateSandboxExpression(expression, bindingScope(context));
}

export async function runEventScript(script: string, context: EventContext) {
  if (!script.trim()) return;

  const result = await executeSandboxEvent(script, {
    ...bindingScope(context),
    event: context.event,
    writeTag: (lookup, value) => context.writeTag(lookup, value as TagValue),
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
