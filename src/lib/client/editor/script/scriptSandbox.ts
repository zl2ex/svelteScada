import Sandbox, { SandboxExecutionQuotaExceededError, type IExecContext } from "@nyariv/sandboxjs";
import { err, ok, type Result } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";
import type { ScriptEvent } from "./scriptApi";

export type ScriptEvaluationError = NeverThrowError & {
  reason: "SCRIPT_COMPILE_ERROR" | "SCRIPT_RUNTIME_ERROR" | "SCRIPT_QUOTA_EXCEEDED";
};

export type SandboxBindingScope = {
  tag: (lookup: string) => unknown;
  tagValue: (lookup: string) => unknown;
  tagStatus: (lookup: string) => string;
};

export type SandboxElementBindingScope = SandboxBindingScope & {
  props: Record<string, unknown>;
  element: Record<string, unknown>;
};

export type SandboxEventScope = SandboxElementBindingScope & {
  event: ScriptEvent;
  writeTag: (lookup: string, value: unknown) => Promise<unknown>;
  goto: (url: string | URL, options?: unknown) => Promise<void>;
  toast: (message: unknown) => unknown;
};

export const EVENT_SCRIPT_TIMEOUT_MS = 2000;

const EXPRESSION_EXECUTION_QUOTA = 100_000n;
const EVENT_EXECUTION_QUOTA = 2_000_000n;

type Executor<T> = (...scopes: Record<string, unknown>[]) => {
  context: IExecContext;
  run: () => T;
};

function createSandbox(quota: bigint) {
  const globals = { ...Sandbox.SAFE_GLOBALS };
  delete globals.Function;
  delete globals.eval;

  return new Sandbox({ globals, executionQuota: quota });
}

const expressionSandbox = createSandbox(EXPRESSION_EXECUTION_QUOTA);
const expressionCache = new Map<string, Result<Executor<unknown>, ScriptEvaluationError>>();

function compileExpression(expression: string): Result<Executor<unknown>, ScriptEvaluationError> {
  const cached = expressionCache.get(expression);
  if (cached !== undefined) return cached;

  const compiled = attempt(() => expressionSandbox.compile<unknown>(`return (\n${expression}\n);`));

  if (compiled.isErr) {
    console.error(`[script sandbox] could not compile expression "${expression}"`, compiled.error);
    const failure = err({
      reason: "SCRIPT_COMPILE_ERROR",
      cause: errorToString(compiled.error),
    } as const satisfies ScriptEvaluationError);
    expressionCache.set(expression, failure);
    return failure;
  }

  const success = ok(compiled.data);
  expressionCache.set(expression, success);
  return success;
}

export function evaluateSandboxExpression<Scope extends Record<string, unknown>>(
  expression: string,
  scope: Scope,
): Result<unknown, ScriptEvaluationError> {
  if (!expression.trim()) return ok(undefined);

  const compiled = compileExpression(expression);
  if (compiled.isErr()) return err(compiled.error);

  const result = attempt(() => {
    const execution = compiled.value(scope as Record<string, unknown>);
    execution.context.ctx.ticks.ticks = 0n;
    return execution.run();
  });

  if (result.isErr) {
    if (result.error instanceof SandboxExecutionQuotaExceededError) {
      console.error(`[script sandbox] expression "${expression}" exceeded its execution quota`);
      return err({
        reason: "SCRIPT_QUOTA_EXCEEDED",
        cause: errorToString(result.error),
      } as const satisfies ScriptEvaluationError);
    }

    console.error(`[script sandbox] expression "${expression}" threw`, result.error);
    return err({
      reason: "SCRIPT_RUNTIME_ERROR",
      cause: errorToString(result.error),
    } as const satisfies ScriptEvaluationError);
  }

  return ok(result.data);
}

export async function executeSandboxEvent(
  script: string,
  scope: SandboxEventScope,
  timeoutMs = EVENT_SCRIPT_TIMEOUT_MS,
) {
  if (!script.trim()) return { isOk: true, isErr: false, data: undefined } as const;

  const sandbox = createSandbox(EVENT_EXECUTION_QUOTA);
  const compiled = attempt(() => sandbox.compileAsync<unknown>(script));

  if (compiled.isErr) {
    console.error(`[script sandbox] could not compile event script`, compiled.error);
    return compiled;
  }

  const execution = attempt(() => compiled.data(scope));
  if (execution.isErr) {
    console.error(`[script sandbox] could not start event script`, execution.error);
    return execution;
  }

  execution.data.context.ctx.ticks.ticks = 0n;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      sandbox.haltExecution({ type: "manual" });
      reject(new Error(`Event script timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const result = await attempt(() => Promise.race([execution.data.run(), timeout]));
  if (timer) clearTimeout(timer);

  if (result.isErr) {
    console.error(
      `[script sandbox] event script failed: ${errorToString(result.error)}`,
      result.error,
    );
    return result;
  }

  return result;
}
