import { browser } from "$app/environment";
import { z } from "zod";
import { err, ok, type Result } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { newId } from "$lib/util/newId";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

const LAST_SESSION_TAGS_KEY = "trend:lastSession:tagIds";
const SAVED_VIEWS_KEY = "trend:savedViews";

export const z_TrendViewSavedConfig = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  selectedTagIds: z.array(z.string().min(1)),
});

export type TrendViewSavedConfig = z.infer<typeof z_TrendViewSavedConfig>;

export const z_TrendViewSavedConfigList = z.array(z_TrendViewSavedConfig);

export type TrendViewSavedConfigList = z.infer<
  typeof z_TrendViewSavedConfigList
>;

const z_TagIds = z.array(z.string().min(1));

export function loadLastSessionTagIds(): Result<string[], NeverThrowError> {
  if (!browser) return ok([]);

  const stored = attempt(() => localStorage.getItem(LAST_SESSION_TAGS_KEY));
  if (stored.error) {
    return err({
      reason: "TREND_VIEW_LOAD_LAST_FAILED",
      cause: errorToString(stored.error),
    } as const satisfies NeverThrowError);
  }

  const raw = stored.data;
  if (!raw) return ok([]);

  const parsed = attempt(() => JSON.parse(raw) as unknown);
  if (parsed.error) {
    return err({
      reason: "TREND_VIEW_PARSE_LAST_FAILED",
      cause: errorToString(parsed.error),
    } as const satisfies NeverThrowError);
  }

  const validated = z_TagIds.safeParse(parsed.data);
  if (!validated.success) {
    return err({
      reason: "TREND_VIEW_VALIDATE_LAST_FAILED",
      cause: validated.error.message,
    } as const satisfies NeverThrowError);
  }

  return ok(validated.data);
}

export function saveLastSessionTagIds(
  tagIds: string[],
): Result<void, NeverThrowError> {
  if (!browser) return ok(undefined);

  const toStore = tagIds.slice();
  const saved = attempt(() =>
    localStorage.setItem(LAST_SESSION_TAGS_KEY, JSON.stringify(toStore)),
  );
  if (saved.error) {
    return err({
      reason: "TREND_VIEW_SAVE_LAST_FAILED",
      cause: errorToString(saved.error),
    } as const satisfies NeverThrowError);
  }

  return ok(undefined);
}

export function loadSavedViews(): Result<
  TrendViewSavedConfigList,
  NeverThrowError
> {
  if (!browser) return ok([]);

  const stored = attempt(() => localStorage.getItem(SAVED_VIEWS_KEY));
  if (stored.error) {
    return err({
      reason: "TREND_VIEW_LOAD_SAVED_FAILED",
      cause: errorToString(stored.error),
    } as const satisfies NeverThrowError);
  }

  const raw = stored.data;
  if (!raw) return ok([]);

  const parsed = attempt(() => JSON.parse(raw) as unknown);
  if (parsed.error) {
    return err({
      reason: "TREND_VIEW_PARSE_SAVED_FAILED",
      cause: errorToString(parsed.error),
    } as const satisfies NeverThrowError);
  }

  const validated = z_TrendViewSavedConfigList.safeParse(parsed.data);
  if (!validated.success) {
    return err({
      reason: "TREND_VIEW_VALIDATE_SAVED_FAILED",
      cause: validated.error.message,
    } as const satisfies NeverThrowError);
  }

  return ok(validated.data.slice().sort((a, b) => b.updatedAt - a.updatedAt));
}

function persistSavedViews(
  views: TrendViewSavedConfigList,
): Result<void, NeverThrowError> {
  if (!browser) return ok(undefined);

  const saved = attempt(() =>
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views)),
  );
  if (saved.error) {
    return err({
      reason: "TREND_VIEW_SAVE_SAVED_FAILED",
      cause: errorToString(saved.error),
    } as const satisfies NeverThrowError);
  }

  return ok(undefined);
}

export function saveView(
  name: string,
  tagIds: string[],
): Result<TrendViewSavedConfig, NeverThrowError> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    return err({
      reason: "TREND_VIEW_INVALID_NAME",
      cause: "name must be between 1 and 100 characters",
    } as const satisfies NeverThrowError);
  }

  const loaded = loadSavedViews();
  if (loaded.isErr()) return err(loaded.error);

  const now = Date.now();
  const next: TrendViewSavedConfig = {
    id: newId(),
    name: trimmed,
    createdAt: now,
    updatedAt: now,
    selectedTagIds: tagIds.slice(),
  };

  const persisted = persistSavedViews([next, ...loaded.value]);
  if (persisted.isErr()) return err(persisted.error);

  return ok(next);
}

export function deleteView(id: string): Result<void, NeverThrowError> {
  const loaded = loadSavedViews();
  if (loaded.isErr()) return err(loaded.error);

  const updated = loaded.value.filter((view) => view.id !== id);
  return persistSavedViews(updated);
}
