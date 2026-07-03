// tags.svelte.ts
//
// Local tags store with undo/redo, backed by Travels (mutable mode) and
// synced to the server via existing CRUD RPCs (createTag / updateTag / deleteTag).
//
// Design:
// - State is keyed by tag id (Record<string, Tag>), not an array. This makes
//   JSON Patch paths land directly on "/tagId" or "/tagId/field", which maps
//   cleanly onto create/update/delete RPCs — no array-index fragility.
// - Local edits go through travels.setState(...). A subscribe() listener
//   diffs the patch history to figure out exactly what changed and fires the
//   matching RPC. Undo/redo re-enter this same path, so they're indistinguishable
//   from a fresh edit as far as the server/other clients are concerned.
// - Remote CRUD events (from other users) are applied by mutating the
//   underlying object directly — NOT via travels.setState — so they never
//   enter this client's undo/redo stack.

import { createTravels, type TravelPatches } from "travels";
import { createTag, updateTag, deleteTag } from "$live/tag-folder"; // your existing RPCs
import { tagList } from "$live/tag-folder"; // live.stream(..., { merge: 'crud', key: 'id' })

export interface Tag {
  id: string;
  name: string;
  // ...other tag fields
}

type TagMap = Record<string, Tag>;

// Svelte 5 reactive proxy — this exact object reference is handed to Travels
// so that Mutative's mutable-mode apply() mutates through the same proxy
// Svelte is watching, same pattern as the Vue/Pinia example in Travels' docs.
const state = $state<TagMap>({});

const travels = createTravels(state, { mutable: true, maxHistory: 50 });
const controls = travels.getControls();

// --- local edit -> network translation -------------------------------------

let prevPosition = travels.getPosition();

// Walks the ops for a single history transition (position p -> p+1, applied
// in the "forward" direction) and fires the matching RPC per op.
function sendOpsToServer(ops: TravelPatches["patches"][number]) {
  for (const op of ops) {
    // path looks like "/tagId" (whole-object add/remove) or "/tagId/field"
    const [, id, field] = op.path.split("/");

    if (op.op === "add" && field === undefined) {
      createTag(op.value as Tag); // recreate with explicit id (see note below)
    } else if (op.op === "remove" && field === undefined) {
      deleteTag(id);
    } else if (op.op === "add" || op.op === "replace") {
      updateTag(id, { [field]: op.value });
    }
    // 'remove' on a field (op.path has a field) shouldn't normally occur for
    // tags with a fixed shape; add handling here if your Tag type has optional fields.
  }
}

travels.subscribe((_newState, patches, position) => {
  if (position === prevPosition) {
    prevPosition = position;
    return; // no-op update, nothing to send
  }

  // Handles single-step setState/back/forward. If you use go(n) or
  // back(amount)/forward(amount) with amount > 1, loop over each
  // intermediate step instead of jumping straight from prevPosition to position.
  if (position > prevPosition) {
    // new edit or redo: the ops that were just applied are patches.patches[prevPosition]
    sendOpsToServer(patches.patches[prevPosition]);
  } else {
    // undo: the ops that were just applied are the inverse of patches.patches[position]
    sendOpsToServer(patches.inversePatches[position]);
  }

  prevPosition = position;
});

// --- local edit API ----------------------------------------------------------

export function addTag(tag: Tag) {
  travels.setState((draft) => {
    draft[tag.id] = tag;
  });
}

export function renameTag(id: string, name: string) {
  travels.setState((draft) => {
    draft[id].name = name;
  });
}

export function removeTag(id: string) {
  travels.setState((draft) => {
    delete draft[id];
  });
}

export function undo() {
  controls.back();
}

export function redo() {
  controls.forward();
}

export { controls as tagControls, state as tags };

// --- remote sync: merge other users' CRUD events without touching history ---
//
// tagList is the existing crud-merge live.stream store, already kept in sync
// by svelte-realtime (including delta sync on reconnect). We mirror its
// array into our id-keyed `state` object directly, bypassing travels.setState
// entirely, so a collaborator's edit never lands in this client's undo stack.
//
// This diffs by id on every change to $tagList rather than requiring a raw
// per-event hook, since that's what's available through the documented
// crud-merge store API.

let knownIds = new Set<string>();

$effect(() => {
  const incoming = $tagList ?? [];
  const incomingIds = new Set(incoming.map((t) => t.id));

  for (const tag of incoming) {
    // create or update — plain property assignment on the $state proxy
    // triggers Svelte reactivity without going through Travels at all.
    if (state[tag.id] !== tag) {
      state[tag.id] = tag;
    }
  }

  for (const id of knownIds) {
    if (!incomingIds.has(id)) {
      delete state[id]; // remote delete
    }
  }

  knownIds = incomingIds;
});

// NOTE / known limitation: because remote merges and travels' own back()/
// forward() both mutate the same live object, an undo that replays an old
// inverse patch could clobber a field a collaborator changed in the
// meantime (a torn write). For tags this is usually low-stakes (last edit
// wins visually, and the next remote event or reconnect resync corrects
// it), but if you need it airtight, add the per-row version check
// discussed earlier: compare the tag's server version before sending
// updateTag/deleteTag from sendOpsToServer, and reconcile on mismatch
// rather than overwriting blindly.
