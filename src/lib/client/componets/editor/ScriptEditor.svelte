<script lang="ts">
  import { onMount } from "svelte";
  import type * as Monaco from "monaco-editor";

  let {
    value = "",
    height = "160px",
    readonly = false,
    ariaLabel = "Script editor",
    onchange,
    onblur,
  }: {
    value?: string;
    height?: string;
    readonly?: boolean;
    ariaLabel?: string;
    onchange?: (value: string) => void;
    onblur?: (value: string) => void;
  } = $props();

  let container: HTMLDivElement;
  let editor = $state.raw<Monaco.editor.IStandaloneCodeEditor>();
  let model = $state.raw<Monaco.editor.ITextModel>();
  let loading = $state(true);
  let syncing = false;

  $effect(() => {
    if (!model) return;
    if (model.getValue() === value) return;

    syncing = true;
    model.setValue(value);
    syncing = false;
  });

  $effect(() => {
    editor?.updateOptions({ readOnly: readonly });
  });

  onMount(() => {
    let cancelled = false;
    let changeListener: Monaco.IDisposable | undefined;
    let blurListener: Monaco.IDisposable | undefined;

    void (async () => {
      const { configureMonaco, monaco } = await import("$lib/client/editor/script/monaco");
      if (cancelled) return;

      configureMonaco();

      const nextModel = monaco.editor.createModel(
        value,
        "javascript",
        monaco.Uri.parse(`inmemory://script/${crypto.randomUUID()}.js`),
      );

      const nextEditor = monaco.editor.create(container, {
        model: nextModel,
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false },
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        fontSize: 12,
        tabSize: 2,
        wordWrap: "on",
        readOnly: readonly,
        ariaLabel,
        padding: { top: 8, bottom: 8 },
        suggest: { showWords: false },
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        //fixedOverflowWidgets: true, // This renders hover tooltips and context menus outside of parent containers with overflow hidden
      });

      model = nextModel;
      editor = nextEditor;

      changeListener = nextModel.onDidChangeContent(() => {
        if (syncing) return;
        onchange?.(nextModel.getValue());
      });

      blurListener = nextEditor.onDidBlurEditorText(() => {
        onblur?.(nextModel.getValue());
      });

      loading = false;
    })();

    return () => {
      cancelled = true;
      changeListener?.dispose();
      blurListener?.dispose();
      editor?.dispose();
      model?.dispose();
    };
  });
</script>

<div class="relative rounded border border-surface-300-700" style:height>
  <div class="absolute inset-0" bind:this={container}></div>
  {#if loading}
    <div class="absolute inset-0 grid place-items-center text-xs opacity-50">Loading editor...</div>
  {/if}
</div>
