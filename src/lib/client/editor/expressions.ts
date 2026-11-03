import type { TagMapEntry, TagMapStatus } from "$lib/client/live/tagMap.svelte";
import type { ClientTagValue } from "$lib/server/tag/tag";
import { clonePlain } from "$lib/client/editor/script/plainData";
import {
  evaluateSandboxExpression,
  type ScriptEvaluationError,
} from "$lib/client/editor/script/scriptSandbox";
import { ok, type Result } from "neverthrow";

export type TagRead = (lookup: string) => TagMapEntry | undefined;
export type TagValueRead = (lookup: string) => ClientTagValue | undefined;
export type TagStatusRead = (lookup: string) => TagMapStatus;

export type BindingContext = {
  tag: TagRead;
  tagValue: TagValueRead;
  tagStatus: TagStatusRead;
};

export function createBindingScope<Context extends Record<string, unknown>>(context: Context) {
  const scope: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    if (key === "tag") {
      const tag = value as TagRead;
      scope.tag = (lookup: string) => clonePlain(tag(lookup));
    } else if (key === "tagValue") {
      const tagValue = value as TagValueRead;
      scope.tagValue = (lookup: string) => clonePlain(tagValue(lookup));
    } else if (key === "tagStatus") {
      const tagStatus = value as TagStatusRead;
      scope.tagStatus = (lookup: string) => tagStatus(lookup);
    } else {
      scope[key] = clonePlain(value);
    }
  }

  return scope;
}

export function evaluateExpression<Context extends Record<string, unknown>>(
  expression: string,
  context: Context,
): Result<unknown, ScriptEvaluationError> {
  if (!expression.trim()) return ok(undefined);
  return evaluateSandboxExpression(expression, createBindingScope(context));
}
