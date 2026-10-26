<script lang="ts">
  import { goto } from "$app/navigation";
  import { page as routePage } from "$app/state";
  import { X } from "@lucide/svelte";
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { toast } from "$lib/client/toast.svelte";
  import { neverThrowErrorToString } from "$lib/util/neverThrow";

  const editor = getEditorContext();

  let openPages = $derived(
    editor.openPageIds
      .map((id) => editor.pagesCollection.state[id])
      .filter((page) => page !== undefined && page.projectId === editor.activeProjectId),
  );

  async function activate(id: string) {
    const result = await editor.openPage(id);
    if (result.isErr()) {
      toast({
        kind: "error",
        title: "Open Page Error",
        description: neverThrowErrorToString(result.error),
        duration: 3000,
      });
      return;
    }
    if (routePage.url.pathname !== "/editor") {
      await goto("/editor", { keepFocus: true });
    }
  }

  function close(event: MouseEvent, id: string) {
    event.stopPropagation();
    editor.closePage(id);
  }
</script>

{#if openPages.length > 0}
  <div
    class="flex items-stretch gap-px overflow-x-auto border-b border-surface-200-800 bg-surface-100-900 text-xs"
  >
    {#each openPages as page (page.id)}
      <button
        class="group flex items-center gap-2 px-3 py-1.5 border-surface-100-900 hover:bg-surface-200-800"
        class:border-b-primary-400-600={editor.activePageId === page.id}
        class:border-b-4={editor.activePageId === page.id}
        onclick={() => activate(page.id)}
      >
        <span class="truncate max-w-48">{page.name}</span>
        {#if editor.activePageId === page.id}
          <span class="truncate max-w-48 opacity-60">
            {`/${editor.projectForPage(page)?.name}${editor.pagePath(page.id)}`}
          </span>
        {/if}
        <span
          class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-300-700"
          role="button"
          tabindex="-1"
          onclick={(event) => close(event, page.id)}
          onkeydown={(event) => {
            if (event.key === "Enter") close(event as unknown as MouseEvent, page.id);
          }}
        >
          <X class="size-3" />
        </span>
      </button>
    {/each}
  </div>
{/if}
