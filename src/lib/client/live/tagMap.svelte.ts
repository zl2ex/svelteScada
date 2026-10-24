import { browser } from "$app/environment";
import { getTagValue, tagPatches, writeTagValue } from "$live/tags";
import { SvelteMap } from "svelte/reactivity";
import { RpcError, type StreamStore } from "svelte-realtime/client";
import {
  type ConnectionStatus,
  type Payload,
  type UseStreamResult,
} from "$lib/client/live/streamResult.svelte";
import type { ClientTagValue, TagValue } from "$lib/server/tag/tag";
import { attempt } from "$lib/util/attempt";
import {
  errorToString,
  neverThrowErrorToString,
  wireErr,
  type NeverThrowError,
  type WireResult,
} from "$lib/util/neverThrow";
import { toast } from "../toast.svelte";

type TagStream = ReturnType<typeof getTagValue>;
type TagStreamPayload = TagStream extends StreamStore<infer S> ? S : never;
type TagEntryValue = Payload<TagStreamPayload>;

export type TagMapEntry = UseStreamResult<TagStreamPayload>;
export type TagMapStatus = TagMapEntry["status"] | "missing";

function isRpcErrorPayload(value: unknown): value is { error: RpcError } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    (value as { error: unknown }).error instanceof RpcError
  );
}

function loadingEntry(): TagMapEntry {
  return { status: "loading", value: null, error: null };
}

export function createTagValueMap(options: {
  tags: Record<string, unknown>;
  tagPaths?: Record<string, string>;
}) {
  return new TagValueMap({
    tagIds: Object.keys(options.tags),
    tagPaths: options.tagPaths,
  });
}

export class TagValueMap {
  readonly entries = new SvelteMap<string, TagMapEntry>();

  #lookupToId = new Map<string, string>();
  #pathById = new Map<string, string>();
  #subscriptions = new Map<string, () => void>();
  #tagPatchesUnsubscribe?: () => void;
  #disposed = false;

  constructor(options: { tagIds: string[]; tagPaths?: Record<string, string> }) {
    for (const id of options.tagIds) {
      this.#lookupToId.set(id, id);
      const path = options.tagPaths?.[id];
      if (path) this.#setPath(id, path);
    }

    if (!browser) return;

    this.#tagPatchesUnsubscribe = tagPatches.subscribe((payload) => {
      if (!payload || isRpcErrorPayload(payload)) return;
      for (const op of payload.patches) {
        if (!Array.isArray(op.path) || op.path.length !== 1) continue;
        const id = String(op.path[0]);
        if (op.op === "add") this.#subscribe(id);
        if (op.op === "remove") this.#unsubscribe(id);
      }
    });

    for (const id of options.tagIds) this.#subscribe(id);
  }

  get(lookup: string): TagMapEntry | undefined {
    const id = this.#lookupToId.get(lookup) ?? lookup;
    return this.entries.get(id);
  }

  tag(lookup: string) {
    const entry = this.get(lookup);
    return entry;
  }

  tagStatus(lookup: string): TagMapStatus {
    return this.get(lookup)?.status ?? "missing";
  }

  async writeTag(
    lookup: string,
    value: TagValue,
  ): Promise<WireResult<{ success: true }, NeverThrowError>> {
    const id = this.#lookupToId.get(lookup);
    const written = await attempt(() =>
      writeTagValue(id ? { id, value } : { path: lookup, value }),
    );
    if (written.error) {
      toast({
        kind: "error",
        title: "TAG_WRITE_ERROR",
        description: errorToString(written.error),
        duration: 3000,
      });

      return wireErr({
        reason: "TAG_WRITE_ERROR",
        cause: errorToString(written.error),
      } as const satisfies NeverThrowError);
    }
    return written.data;
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#tagPatchesUnsubscribe?.();
    for (const unsubscribe of this.#subscriptions.values()) unsubscribe();
    this.#subscriptions.clear();
    this.entries.clear();
    this.#lookupToId.clear();
    this.#pathById.clear();
  }

  #subscribe(id: string) {
    if (this.#disposed || this.#subscriptions.has(id)) return;

    this.entries.set(id, loadingEntry());
    this.#lookupToId.set(id, id);

    const stream = getTagValue(id);
    let value: TagEntryValue | null = null;
    let error: RpcError | null = null;
    let connection: ConnectionStatus = "loading";

    const publish = () => {
      let entry: TagMapEntry;
      if (error) {
        entry = { status: "error", value: null, error };
      } else if (value === null) {
        entry = loadingEntry();
      } else if (connection === "reconnecting") {
        entry = { status: "reconnecting", value, error: null };
      } else {
        entry = { status: "connected", value, error: null };
      }

      if ((entry.status === "connected" || entry.status === "reconnecting") && entry.value.isOk) {
        this.#setPath(id, entry.value.value.path);
      }
      this.entries.set(id, entry);
    };

    const unsubscribers = [
      stream.subscribe((incoming) => {
        if (isRpcErrorPayload(incoming)) {
          error = incoming.error;
          publish();
          return;
        }
        value = incoming === undefined ? null : (incoming as TagEntryValue);
        publish();
      }),
      stream.error?.subscribe((incoming) => {
        error = incoming;
        publish();
      }),
      stream.status?.subscribe((incoming) => {
        connection = incoming;
        publish();
      }),
    ];

    this.#subscriptions.set(id, () => {
      for (const unsubscribe of unsubscribers) unsubscribe?.();
    });
    publish();
  }

  #unsubscribe(id: string) {
    this.#subscriptions.get(id)?.();
    this.#subscriptions.delete(id);
    this.entries.delete(id);

    const path = this.#pathById.get(id);
    if (path) this.#lookupToId.delete(path);
    this.#pathById.delete(id);
    this.#lookupToId.delete(id);
  }

  #setPath(id: string, path: string) {
    if (!path) return;
    const previous = this.#pathById.get(id);
    if (previous && previous !== path) this.#lookupToId.delete(previous);
    this.#pathById.set(id, path);
    this.#lookupToId.set(path, id);
    this.#lookupToId.set(id, id);
  }
}
