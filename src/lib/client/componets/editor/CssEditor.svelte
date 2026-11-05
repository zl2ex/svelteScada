<script lang="ts">
  import { onMount } from "svelte";
  import type * as Monaco from "monaco-editor";

  let {
    value = "",
    height = "420px",
    readonly = false,
    ariaLabel = "CSS editor",
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
        "css",
        monaco.Uri.parse(`inmemory://theme/${crypto.randomUUID()}.css`),
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

<div class="relative w-full rounded border border-surface-300-700" style:height>
  <div class="absolute inset-0" bind:this={container}></div>
  {#if loading}
    <div class="absolute inset-0 grid place-items-center text-xs opacity-50">Loading editor...</div>
  {/if}
</div>
