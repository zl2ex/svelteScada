<script lang="ts">
  import { onDestroy } from "svelte";
  import { Redo2, Undo2 } from "@lucide/svelte";
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { PatchCollection } from "$lib/client/live/patchCollection.svelte";
  import { applyPageElementPatches, pageElementPatches } from "$live/pages";
  import type { ElementRecord } from "$lib/page/elementTypes";
  import type { PageRecord } from "$lib/page/pageTypes";
  import type { NeverThrowError } from "$lib/util/neverThrow";
  import { undoManager } from "$lib/client/history/undoManager";
  import PageCanvas from "./PageCanvas.svelte";

  type Props = {
    pageId: string;
    page: PageRecord;
    elements: Record<string, ElementRecord>;
  };

  let { pageId, page, elements }: Props = $props();
  const editor = getEditorContext();

  const documentId = `page:${pageId}`;

  const collection = new PatchCollection<ElementRecord, NeverThrowError>({
    initial: elements,
    applyPatch: (patch) => applyPageElementPatches({ pageId, patch }),
    subscribePatches: (notify) => {
      const unsubscribe = pageElementPatches(pageId).subscribe((payload) => {
        if (!payload || "error" in payload) {
          notify(null);
          return;
        }
        notify(payload);
      });
      return unsubscribe;
    },
    maxHistory: 100,
    onMutation: () => undoManager.recordMutation(documentId),
    onError: (error) => console.error("Element sync error:", error),
  });

  undoManager.register(documentId, collection, "document");
  undoManager.setActiveDocument(documentId);
  editor.setElements(collection);

  onDestroy(() => {
    undoManager.clearHistory(documentId);
    undoManager.unregister(documentId);
    if (undoManager.getActiveDocument() === documentId) {
      undoManager.setActiveDocument(null);
    }
    editor.clearElements(collection);
    collection.dispose();
  });
</script>

<div class="flex flex-col h-full min-h-0">
  <div
    class="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-surface-200-800 text-xs"
  >
    <div class="flex items-center gap-2 min-w-0">
      <span class="font-semibold truncate">{page.name}</span>
      <span class="opacity-50 truncate">{editor.route(page.id)}</span>
    </div>
    <div class="flex items-center gap-1">
      <button
        class="btn btn-sm {editor.mode === 'edit' ? 'preset-filled' : 'preset-tonal'}"
        title="Edit mode"
        onclick={() => (editor.mode = "edit")}
      >
        Edit
      </button>
      <button
        class="btn btn-sm {editor.mode === 'preview' ? 'preset-filled' : 'preset-tonal'}"
        title="Preview mode"
        onclick={() => (editor.mode = "preview")}
      >
        Preview
      </button>
      <button
        class="btn btn-sm preset-tonal"
        title="Undo"
        disabled={!undoManager.canUndo()}
        onclick={() => undoManager.undo()}
      >
        <Undo2 class="size-3.5" />
      </button>
      <button
        class="btn btn-sm preset-tonal"
        title="Redo"
        disabled={!undoManager.canRedo()}
        onclick={() => undoManager.redo()}
      >
        <Redo2 class="size-3.5" />
      </button>
    </div>
  </div>
  <div class="grow min-h-0">
    <PageCanvas elements={collection.state} containerType={page.containerType} mode={editor.mode} />
  </div>
</div>
