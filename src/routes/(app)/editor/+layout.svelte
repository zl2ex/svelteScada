<script lang="ts">
  import { LoaderIcon } from "@lucide/svelte";
  import { Tabs } from "@skeletonlabs/skeleton-svelte";

  import { PatchCollection } from "$lib/client/live/patchCollection.svelte";
  import { onMount } from "svelte";
  import { neverThrowErrorToString, type NeverThrowError } from "$lib/util/neverThrow";
  import { PanelLayout } from "$lib/client/util/localStorage/panelLayout.svelte";
  import { undoManager } from "$lib/client/history/undoManager";
  import { EditorState } from "$lib/client/editor/editorState.svelte.js";
  import { setEditorContext } from "$lib/client/editor/editorContext.js";
  import type { PageRecord } from "$lib/page/pageTypes";
  import { page } from "$app/state";
  import { pagePatches, applyPagePatches } from "$live/pages";
  import TagsTab from "$lib/client/componets/editor/TagsTab.svelte";
  import PagesTab from "$lib/client/componets/editor/PagesTab.svelte";
  import PageOpenTabs from "$lib/client/componets/editor/PageOpenTabs.svelte";
  import PageProperties from "$lib/client/componets/editor/PageProperties.svelte";
  import ElementProperties from "$lib/client/componets/editor/ElementProperties.svelte";
  import ElementsInsert from "$lib/client/componets/editor/ElementsInsert.svelte";

  let { data, children } = $props();

  const panelLayout = new PanelLayout();

  let pagePatchesCollection = $state(
    new PatchCollection<PageRecord, NeverThrowError>({
      initial: data.pages,
      applyPatch: applyPagePatches,
      subscribePatches: (notify) => {
        const unsubscribe = pagePatches.subscribe((payload) => {
          if (!payload || "error" in payload) {
            notify(null);
            return;
          }
          notify(payload);
        });
        return unsubscribe;
      },
      maxHistory: 50,
      onMutation: () => undoManager.recordMutation("pages"),
      onError: (e) => console.error("Page sync error:", e),
    }),
  );

  const editorState = new EditorState({
    pages: pagePatchesCollection,
    projects: data.projects,
    userComponents: data.userComponents,
  });

  setEditorContext(editorState);

  $effect(() => {
    const id = page.url.searchParams.get("page");
    editorState.setActivePage(id && editorState.pages.state[id] ? id : null);
  });

  undoManager.register("pages", pagePatchesCollection);

  onMount(() => {
    const loaded = panelLayout.loadFromLocalStorage();
    if (loaded.isErr()) {
      console.error(neverThrowErrorToString(loaded.error));
    }
    // unmount
    return () => {
      undoManager.unregister("pages");
      pagePatchesCollection.dispose();
    };
  });
</script>

<aside
  id="left-panel"
  style={panelLayout.width.left ? `width: ${panelLayout.width.left}px` : ""}
  class="text-xs"
>
  <svelte:boundary
    onerror={(error) => {
      console.error(error);
    }}
  >
    <Tabs defaultValue="tags">
      <Tabs.List>
        <Tabs.Trigger class="flex-1 text-xs" value="tags">Tags</Tabs.Trigger>
        <Tabs.Trigger class="flex-1 text-xs" value="udts">Udts</Tabs.Trigger>
        <Tabs.Trigger class="flex-1 text-xs" value="pages">Pages</Tabs.Trigger>
        <Tabs.Indicator />
      </Tabs.List>
      <Tabs.Content value="tags">
        <TagsTab tagFolders={data.tagFolders} tags={data.tags} />
      </Tabs.Content>
      <Tabs.Content value="udts">User Defined data types</Tabs.Content>
      <Tabs.Content value="pages">
        <PagesTab />
      </Tabs.Content>
    </Tabs>
    {#snippet pending()}
      <LoaderIcon class="size-4 animate-spin" />
    {/snippet}
    {#snippet failed(error, reset)}
      <p class="text-error-700-300">{error}</p>
      <button onclick={reset} class="btn preset-filled">reset</button>
    {/snippet}
  </svelte:boundary>
</aside>
<button
  class="w-px bg-surface-200-800 cursor-col-resize active:bg-primary-600-400"
  onpointerdown={() => {
    panelLayout.dragging.left = true;
  }}
  title="drag to resize left panel"
></button>

<main id="center-panel" class="grow min-w-0 flex flex-col">
  <PageOpenTabs />
  <div class="grow min-h-0">
    {@render children?.()}
  </div>
</main>
<button
  class="w-px bg-surface-200-800 cursor-col-resize active:bg-primary-600-400"
  onpointerdown={() => {
    panelLayout.dragging.right = true;
  }}
  title="drag to resize right panel"
></button>

<aside
  id="right-panel"
  class="overflow-y-auto"
  style={panelLayout.width.right ? `width: ${panelLayout.width.right}px` : ""}
>
  {#if editorState.activePage}
    <ElementsInsert />
    <div class="border-t border-surface-200-800">
      {#if editorState.selectedElementId}
        <ElementProperties />
      {:else}
        <PageProperties />
      {/if}
    </div>
  {:else}
    <p class="p-3 text-xs opacity-50">Open a page to insert elements.</p>
  {/if}
</aside>

<style>
  /* skeleton <TreeView> change selected apperance */

  :global(
    [data-scope="tree-view"] [data-part="item"][data-selected],
    [data-scope="tree-view"] [data-part="branch-control"][data-selected]
  ) {
    background-color: light-dark(var(--color-primary-300), var(--color-primary-800));
    color: light-dark(var(--color-neutral-000), var(--color-neutral-900));
  }
</style>
