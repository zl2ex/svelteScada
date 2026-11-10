import { browser } from "$app/environment";
import { getTagValue, tagPatches, writeTagValue } from "$live/tags";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
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
  readonly tagPaths = new SvelteSet<string>();

  #lookupToId = new Map<string, string>();
  #pathById = new Map<string, string>();
  #subscriptions = new Map<string, () => void>();
  #childIds = new Map<string, Set<string>>();
  #parentId = new Map<string, string>();
  #tagPatchesUnsubscribe?: () => void;
  #disposed = false;

  constructor(options: { tagIds: string[]; tagPaths?: Record<string, string> }) {
    const tagIds = new Set([...options.tagIds, ...Object.keys(options.tagPaths ?? {})]);
    for (const id of tagIds) {
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
        if (op.op === "replace" && !this.#subscriptions.has(id)) this.#subscribe(id);
        if (op.op === "remove") this.#unsubscribeTree(id);
      }
    });

    for (const id of tagIds) this.#subscribe(id);
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

  tagValue(lookup: string): ClientTagValue | undefined {
    const entry = this.get(lookup);
    if (!entry) return undefined;
    if (entry.status !== "connected" && entry.status !== "reconnecting") return undefined;
    return entry.value.isOk ? entry.value.value : undefined;
  }

  async writeTag(
    lookup: string,
    value: TagValue,
  ): Promise<WireResult<{ success: true }, NeverThrowError>> {
    const id = this.#lookupToId.get(lookup);
    const written = await attempt(() => writeTagValue({ lookup, value }));
    if (written.isErr) {
      toast({
        kind: "error",
        title: "TAG_WRITE_RPC_ERROR",
        description: errorToString(written.error),
        duration: 3000,
      });

      return wireErr({
        reason: "TAG_WRITE_RPC_ERROR",
        cause: errorToString(written.error),
      } as const satisfies NeverThrowError);
    }

    if (written.data.isErr) {
      toast({
        kind: "error",
        title: "TAG_WRITE_ERROR",
        description: neverThrowErrorToString(written.data.error),
        duration: 3000,
      });
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
    this.tagPaths.clear();
    this.#lookupToId.clear();
    this.#pathById.clear();
    this.#childIds.clear();
    this.#parentId.clear();
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
        this.#syncChildren(id, entry.value.value.children ?? []);
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

  #syncChildren(parentId: string, children: ClientTagValue[]) {
    const nextIds = new Set(children.map((child) => child.id));
    const previousIds = this.#childIds.get(parentId) ?? new Set<string>();

    for (const previousId of previousIds) {
      if (!nextIds.has(previousId)) this.#unsubscribeTree(previousId);
    }

    this.#childIds.set(parentId, nextIds);

    for (const child of children) {
      this.#parentId.set(child.id, parentId);
      this.#setPath(child.id, child.path);
      if (!this.#subscriptions.has(child.id)) this.#subscribe(child.id);
      this.#syncChildren(child.id, child.children ?? []);
    }
  }

  #unsubscribeTree(id: string, seen = new Set<string>()) {
    if (seen.has(id)) return;
    seen.add(id);

    const path = this.#pathById.get(id);
    const childIds = new Set(this.#childIds.get(id) ?? []);

    // The parent value may not have loaded yet, so also catch descendants by path.
    if (path) {
      for (const [otherId, otherPath] of this.#pathById) {
        if (otherPath.startsWith(`${path}.`)) childIds.add(otherId);
      }
    }

    for (const childId of childIds) {
      this.#unsubscribeTree(childId, seen);
    }

    this.#unsubscribeSelf(id);
  }

  #unsubscribeSelf(id: string) {
    this.#subscriptions.get(id)?.();
    this.#subscriptions.delete(id);
    this.entries.delete(id);

    const parentId = this.#parentId.get(id);
    if (parentId) this.#childIds.get(parentId)?.delete(id);
    this.#parentId.delete(id);
    this.#childIds.delete(id);

    const path = this.#pathById.get(id);
    if (path) {
      this.#lookupToId.delete(path);
      this.tagPaths.delete(path);
    }
    this.#pathById.delete(id);
    this.#lookupToId.delete(id);
  }

  #setPath(id: string, path: string) {
    if (!path) return;
    const previous = this.#pathById.get(id);
    if (previous && previous !== path) {
      this.#lookupToId.delete(previous);
      this.tagPaths.delete(previous);
    }
    this.#pathById.set(id, path);
    this.tagPaths.add(path);
    this.#lookupToId.set(path, id);
    this.#lookupToId.set(id, id);
  }
}
