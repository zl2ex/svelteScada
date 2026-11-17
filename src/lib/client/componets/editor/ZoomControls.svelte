<script lang="ts">
  import { ZoomInIcon, ZoomOutIcon } from "@lucide/svelte";
  import {
    MAX_CANVAS_ZOOM,
    MIN_CANVAS_ZOOM,
  } from "$lib/client/editor/canvasZoom";
  import { getEditorContext } from "$lib/client/editor/editorContext";

  const editor = getEditorContext();
</script>

<div class="flex items-center gap-1">
  <button
    type="button"
    class="btn-icon btn-sm"
    title="Zoom out"
    aria-label="Zoom out"
    disabled={editor.canvasZoom <= MIN_CANVAS_ZOOM}
    onclick={() => editor.zoomOut()}
  >
    <ZoomOutIcon class="size-4" />
  </button>

  <button
    type="button"
    class="btn btn-sm min-w-14 px-1 text-xs"
    title="Reset zoom"
    aria-label="Reset zoom"
    onclick={() => editor.resetCanvasZoom()}
  >
    {Math.round(editor.canvasZoom * 100)}%
  </button>

  <button
    type="button"
    class="btn-icon btn-sm"
    title="Zoom in"
    aria-label="Zoom in"
    disabled={editor.canvasZoom >= MAX_CANVAS_ZOOM}
    onclick={() => editor.zoomIn()}
  >
    <ZoomInIcon class="size-4" />
  </button>
</div>
