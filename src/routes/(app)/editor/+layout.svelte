<script lang="ts">
  import {
    ArrowLeftIcon,
    ArrowRightIcon,
    CircleUserIcon,
    LoaderIcon,
    MenuIcon,
    Redo2Icon,
    Undo2Icon,
    XIcon,
  } from "@lucide/svelte";
  import { AppBar, Popover, Portal, Tabs } from "@skeletonlabs/skeleton-svelte";

  import { PatchCollection } from "$lib/client/live/patchCollection.svelte";
  import { onMount } from "svelte";
  import {
    errorToString,
    neverThrowErrorToString,
    type NeverThrowError,
  } from "$lib/util/neverThrow";
  import { PanelLayout } from "$lib/client/util/localStorage/panelLayout.svelte";
  import { undoManager } from "$lib/client/history/undoManager";
  import {
    EditorState,
    type EditorLeftPanelTab,
  } from "$lib/client/editor/editorState.svelte.js";
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
  import { attempt } from "$lib/util/attempt.js";
  import { logout } from "$lib/remote/user.remote.js";
  import { toast } from "$lib/client/toast.svelte.js";
  import { err, ok } from "neverthrow";
  import { goto } from "$app/navigation";
  import { themeManager } from "$lib/client/theme.svelte.js";
  import { getTagValueMapContext } from "$lib/client/live/tagMapContext";
  import type * as ScriptMonaco from "$lib/client/editor/script/monaco";

  let { data, children } = $props();

  const tagValueMap = getTagValueMapContext();
  let scriptMonaco = $state.raw<typeof ScriptMonaco>();

  $effect(() => {
    const paths = [...tagValueMap.tagPaths];
    scriptMonaco?.updateScriptTagPaths(paths);
  });

  const panelLayout = new PanelLayout();

  async function logoutAndGotoLogin() {
    const loggedOut = await attempt(() => logout());
    if (loggedOut.isErr) {
      const cause = errorToString(loggedOut.error);
      toast({
        kind: "error",
        title: "Logout Error",
        description: cause,
        duration: 3000,
      });
      return err({
        reason: "LOGOUT_FAILED",
        cause,
      } as const satisfies NeverThrowError);
    }

    const navigated = await attempt(() => goto("/login"));
    if (navigated.isErr) {
      const cause = errorToString(navigated.error);
      toast({
        kind: "error",
        title: "Navigation Error",
        description: cause,
        duration: 3000,
      });
      return err({
        reason: "LOGOUT_NAVIGATION_FAILED",
        cause,
      } as const satisfies NeverThrowError);
    }

    return ok(null);
  }

  function setTheme(theme: (typeof themeManager.themes)[number]) {
    const result = attempt(() => themeManager.setTheme(theme));
    if (result.isErr) {
      const cause = errorToString(result.error);
      console.error(cause);
    }
  }

  const leftPanelTabs: EditorLeftPanelTab[] = ["tags", "udts", "pages"];

  function isLeftPanelTab(value: string | null): value is EditorLeftPanelTab {
    return value !== null && leftPanelTabs.includes(value as EditorLeftPanelTab);
  }

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

  const editor = new EditorState({
    pages: pagePatchesCollection,
    projects: data.projects,
    userComponents: data.userComponents,
  });

  setEditorContext(editor);

  $effect(() => {
    editor.trackFocus();
  });

  async function focusBack() {
    const result = await editor.backFocus();
    if (result.isErr()) {
      toast({
        kind: "error",
        title: "Back Error",
        description: neverThrowErrorToString(result.error),
        duration: 3000,
      });
    }
  }

  async function focusForward() {
    const result = await editor.forwardFocus();
    if (result.isErr()) {
      toast({
        kind: "error",
        title: "Forward Error",
        description: neverThrowErrorToString(result.error),
        duration: 3000,
      });
    }
  }

  undoManager.register("pages", pagePatchesCollection);

  onMount(() => {
    void import("$lib/client/editor/script/monaco").then((module) => {
      module.configureMonaco();
      scriptMonaco = module;
    });

    const loaded = panelLayout.loadFromLocalStorage();
    if (loaded.isErr()) {
      console.error(neverThrowErrorToString(loaded.error));
    }
    // unmount
    return () => {
      undoManager.unregister("pages");
      pagePatchesCollection.dispose();
      editor.dispose();
    };
  });
</script>

<div id="app" class="flex flex-col h-svh">
  <header>
    <AppBar class="bg-surface-50-950 border-b-surface-200-800 border-b-1 p-2">
      <AppBar.Toolbar class="grid-cols-[auto_1fr_auto]">
        <AppBar.Lead>
          <button type="button" class="btn-icon btn-icon-lg hover:preset-tonal">
            <MenuIcon />
          </button>
        </AppBar.Lead>
        <AppBar.Headline></AppBar.Headline>
        <AppBar.Trail class="items-center">
          <div class="btn-group bg-surface-200-800">
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
          </div>
          <div class="btn-group">
            <button
              class="btn btn-sm preset-tonal"
              title="Undo"
              disabled={!undoManager.canUndo()}
              onclick={() => undoManager.undo()}
            >
              <Undo2Icon class="size-3.5" />
            </button>
            <button
              class="btn btn-sm preset-tonal"
              title="Redo"
              disabled={!undoManager.canRedo()}
              onclick={() => undoManager.redo()}
            >
              <Redo2Icon class="size-3.5" />
            </button>

            <button
              class="btn btn-sm preset-tonal"
              title="Back"
              disabled={!editor.canFocusBack}
              onclick={focusBack}
            >
              <ArrowLeftIcon class="size-3.5" />
            </button>
            <button
              class="btn btn-sm preset-tonal"
              title="Forward"
              disabled={!editor.canFocusForward}
              onclick={focusForward}
            >
              <ArrowRightIcon class="size-3.5" />
            </button>
          </div>

          <Popover>
            <Popover.Trigger class="btn-icon hover:preset-tonal">
              <CircleUserIcon class="size-8" />
            </Popover.Trigger>
            <Portal>
              <Popover.Positioner>
                <Popover.Content class="card p-4 bg-surface-100-900 shadow-xl">
                  <header class="flex justify-between">
                    <Popover.Title class="text-lg font-bold">{data.user?.name}</Popover.Title>
                    <Popover.CloseTrigger class="btn-icon hover:preset-tonal self-start">
                      <XIcon class="size-4" />
                    </Popover.CloseTrigger>
                  </header>

                  <Popover.Description></Popover.Description>
                  <div class="">
                    <div>
                      <button
                        onclick={async () => {
                          const result = await logoutAndGotoLogin();
                          if (result.isErr()) {
                            console.error(`logout() ${neverThrowErrorToString(result.error)}`);
                          }
                        }}
                        class="btn preset-filled"
                      >
                        logout
                      </button>

                      <a class="anchor block" href="/editor">editor</a>
                      <a class="anchor block" href="/trending">trending</a>
                      <nav class="btn-group preset-outlined-surface-300-700">
                        {#each themeManager.themes as theme}
                          <button
                            type="button"
                            class="btn capitalize"
                            class:preset-filled={theme == themeManager.theme}
                            data-theme-picker
                            onclick={() => setTheme(theme)}
                          >
                            {theme}
                          </button>
                        {/each}
                      </nav>
                    </div>
                  </div>
                </Popover.Content>
              </Popover.Positioner>
            </Portal>
          </Popover>
        </AppBar.Trail>
      </AppBar.Toolbar>
    </AppBar>
  </header>

  <main class="flex grow shrink-0 h-0">
    <aside
      id="left-panel"
      style={panelLayout.width.left ? `width: ${panelLayout.width.left}px` : ""}
      class="text-xs flex flex-col min-h-0 overflow-hidden"
    >
      <svelte:boundary
        onerror={(error) => {
          console.error(error);
        }}
      >
        <Tabs
          class="flex-1 min-h-0"
          value={editor.leftPanelTab}
          onValueChange={(details) => {
            if (isLeftPanelTab(details.value)) {
              editor.leftPanelTab = details.value;
            }
          }}
        >
          <Tabs.List class="shrink-0">
            <Tabs.Trigger class="flex-1 text-xs" value="tags">Tags</Tabs.Trigger>
            <Tabs.Trigger class="flex-1 text-xs" value="udts">Udts</Tabs.Trigger>
            <Tabs.Trigger class="flex-1 text-xs" value="pages">Pages</Tabs.Trigger>
            <Tabs.Indicator
              class="[[data-scope='tabs'][data-part='indicator']]:bg-primary-400-600 [[data-scope='tabs'][data-part='indicator']]:h-1"
            />
          </Tabs.List>
          <Tabs.Content value="tags" class="flex-1 min-h-0 overflow-y-auto">
            <TagsTab tagFolders={data.tagFolders} tags={data.tags} />
          </Tabs.Content>
          <Tabs.Content value="udts" class="flex-1 min-h-0 overflow-y-auto">
            User Defined data types
          </Tabs.Content>
          <Tabs.Content value="pages" class="flex-1 min-h-0 overflow-y-auto">
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
      {#if editor.activePage}
        <ElementsInsert />
        <div class="border-t border-surface-200-800">
          {#if editor.selectedElementId}
            <ElementProperties />
          {:else}
            <PageProperties />
          {/if}
        </div>
      {:else}
        <p class="p-3 text-xs opacity-50">Open a page to insert elements.</p>
      {/if}
    </aside>
  </main>
</div>

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
