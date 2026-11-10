<script lang="ts">
  import { Grid3X3Icon } from "@lucide/svelte";
  import { getEditorContext } from "$lib/client/editor/editorContext";

  const editor = getEditorContext();

  function setSpacing(value: string) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    editor.grid.spacing = Math.max(1, Math.min(200, parsed));
  }
</script>

<div class="flex items-center gap-1">
  <button
    type="button"
    class="btn-icon btn-sm"
    class:preset-filled={editor.grid.enabled}
    title="Toggle snapping grid"
    aria-label="Toggle snapping grid"
    aria-pressed={editor.grid.enabled}
    onclick={() => (editor.grid.enabled = !editor.grid.enabled)}
  >
    <Grid3X3Icon class="size-4" />
  </button>

  <input
    class="input h-7 w-16 py-0 px-1 text-xs"
    type="number"
    min="1"
    max="200"
    value={editor.grid.spacing}
    aria-label="Grid spacing in pixels"
    onchange={(event) => setSpacing(event.currentTarget.value)}
  />
</div>
