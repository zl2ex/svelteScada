<script lang="ts">
  import { goto } from "$app/navigation";
  import { X } from "@lucide/svelte";
  import { getEditorContext } from "$lib/client/editor/editorContext";

  const editor = getEditorContext();

  let openPages = $derived(
    editor.openPageIds.map((id) => editor.pages.state[id]).filter((page) => page !== undefined),
  );

  function activate(id: string) {
    editor.setActivePage(id);
    goto(`/editor?page=${id}`, { replaceState: true, keepFocus: true });
  }

  function close(event: MouseEvent, id: string) {
    event.stopPropagation();
    const wasActive = editor.activePageId === id;
    const next = editor.closePage(id);
    if (wasActive) {
      goto(next ? `/editor?page=${next}` : "/editor", { replaceState: true });
    }
  }
</script>

{#if openPages.length > 0}
  <div
    class="flex items-stretch gap-px overflow-x-auto border-b border-surface-200-800 bg-surface-100-900 text-xs"
  >
    {#each openPages as page (page.id)}
      <button
        class="group flex items-center gap-2 px-3 py-1.5 border-r border-surface-200-800 hover:bg-surface-200-800"
        class:bg-surface-200-800={editor.activePageId === page.id}
        onclick={() => activate(page.id)}
      >
        <span class="truncate max-w-48">{page.name}</span>
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
