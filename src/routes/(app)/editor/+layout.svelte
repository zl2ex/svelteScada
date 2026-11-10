<script lang="ts">
  import {
    ArrowLeftIcon,
    ArrowRightIcon,
    ChevronRightIcon,
    HomeIcon,
    KeyboardMusicIcon,
    LogOutIcon,
    MenuIcon,
    MonitorCogIcon,
    MoonIcon,
    PaletteIcon,
    PenIcon,
    Redo2Icon,
    SunIcon,
    Undo2Icon,
    UserIcon,
    XIcon,
  } from "@lucide/svelte";
  import { AppBar, Menu, Popover, Portal, Tabs } from "@skeletonlabs/skeleton-svelte";

  import { PatchCollection } from "$lib/client/live/patchCollection.svelte";
  import { onMount } from "svelte";
  import {
    errorToString,
    neverThrowErrorToString,
    type NeverThrowError,
  } from "$lib/util/neverThrow";
  import { PanelLayout } from "$lib/client/util/localStorage/panelLayout.svelte";
  import { undoManager } from "$lib/client/history/undoManager";
  import { EditorState, type EditorLeftPanelTab } from "$lib/client/editor/editorState.svelte.js";
  import { setEditorContext } from "$lib/client/editor/editorContext.js";
  import type { PageRecord } from "$lib/elements/pageTypes.js";
  import type { UserThemeSelect } from "$lib/sqlite/tables";
  import { page } from "$app/state";
  import { pagePatches, applyPagePatches } from "$live/pages";
  import { userThemePatches, applyUserThemePatches } from "$live/user-theme";
  import { udtPatches, applyUdtPatches } from "$live/udts";
  import type { UdtDefinitionInput } from "$lib/sqlite/tables/udt_definitions";
  import { setUdtDefinitionsContext } from "$lib/client/editor/udtDefinitionContext";
  import TagsTab from "$lib/client/componets/editor/TagsTab.svelte";
  import UdtsTab from "$lib/client/componets/editor/UdtsTab.svelte";
  import PagesTab from "$lib/client/componets/editor/PagesTab.svelte";
  import PageProperties from "$lib/client/componets/editor/PageProperties.svelte";
  import ElementProperties from "$lib/client/componets/editor/ElementProperties.svelte";
  import MultiElementProperties from "$lib/client/componets/editor/MultiElementProperties.svelte";
  import ElementsInsert from "$lib/client/componets/editor/ElementsInsert.svelte";
  import GridControls from "$lib/client/componets/editor/GridControls.svelte";
  import { attempt } from "$lib/util/attempt.js";
  import { logout } from "$lib/remote/user.remote.js";
  import { toast } from "$lib/client/toast.svelte.js";
  import { err, ok } from "neverthrow";
  import { goto } from "$app/navigation";
  import { lightDarkManager } from "$lib/client/lightDark.svelte.js";
  import { getTagValueMapContext } from "$lib/client/live/tagMapContext";
  import type * as ScriptMonaco from "$lib/client/editor/script/monaco";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import type { SelectionDetails } from "@zag-js/menu";

  let { data, children } = $props();

  const tagValueMap = getTagValueMapContext();
  const ability = getAbilityContext();
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

  let userThemePatchesCollection = $state(
    new PatchCollection<UserThemeSelect, NeverThrowError>({
      initial: data.themes.reduce(
        (map, theme) => {
          map[theme.id] = theme;
          return map;
        },
        {} as Record<string, UserThemeSelect>,
      ),
      applyPatch: applyUserThemePatches,
      subscribePatches: (notify) => {
        const unsubscribe = userThemePatches.subscribe((payload) => {
          if (!payload || "error" in payload) {
            notify(null);
            return;
          }
          notify(payload);
        });
        return unsubscribe;
      },
      maxHistory: 50,
      onMutation: () => undoManager.recordMutation("themes"),
      onError: (error) => console.error("Theme sync error:", error),
    }),
  );

  let udtDefinitionPatchesCollection = $state(
    new PatchCollection<UdtDefinitionInput, NeverThrowError>({
      initial: Object.fromEntries(data.udts.map((udt) => [udt.id, udt])),
      applyPatch: applyUdtPatches,
      subscribePatches: (notify) => {
        const unsubscribe = udtPatches.subscribe((payload) => {
          if (!payload || "error" in payload) {
            notify(null);
            return;
          }
          notify(payload);
        });
        return unsubscribe;
      },
      maxHistory: 50,
      onMutation: () => undoManager.recordMutation("udts"),
      onError: (error) => console.error("UDT sync error:", error),
    }),
  );

  setUdtDefinitionsContext(udtDefinitionPatchesCollection);

  const editor = new EditorState({
    pages: pagePatchesCollection,
    userThemes: userThemePatchesCollection,
    projects: data.projects,
    userComponents: data.userComponents,
    initialPath: page.url.pathname + page.url.search,
  });

  if (!ability.can("update", "Page")) {
    editor.mode = "preview";
  }

  setEditorContext(editor);

  $effect(() => {
    editor.trackFocus(page.url.pathname + page.url.search);
  });

  function currentPath() {
    return page.url.pathname + page.url.search;
  }

  async function navigateFocus(targetPath: string | undefined) {
    if (!targetPath || targetPath === currentPath()) return;

    const navigated = await attempt(() => goto(targetPath, { keepFocus: true }));
    if (navigated.isErr) {
      toast({
        kind: "error",
        title: "Navigation Error",
        description: errorToString(navigated.error),
        duration: 3000,
      });
    }
  }

  async function focusBack() {
    const result = await editor.backFocus(currentPath());
    if (result.isErr()) {
      toast({
        kind: "error",
        title: "Back Error",
        description: neverThrowErrorToString(result.error),
        duration: 3000,
      });
      return;
    }
    await navigateFocus(result.value?.path);
  }

  async function focusForward() {
    const result = await editor.forwardFocus(currentPath());
    if (result.isErr()) {
      toast({
        kind: "error",
        title: "Forward Error",
        description: neverThrowErrorToString(result.error),
        duration: 3000,
      });
      return;
    }
    await navigateFocus(result.value?.path);
  }

  undoManager.register("pages", pagePatchesCollection);
  undoManager.register("themes", userThemePatchesCollection);
  undoManager.register("udts", udtDefinitionPatchesCollection);

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
      undoManager.unregister("themes");
      undoManager.unregister("udts");
      pagePatchesCollection.dispose();
      userThemePatchesCollection.dispose();
      udtDefinitionPatchesCollection.dispose();
      editor.dispose();
    };
  });

  async function handleUserMenuSelect(details: SelectionDetails) {
    const action = details.value;

    console.debug(action);
    switch (action) {
      case "logout":
        const result = await logoutAndGotoLogin();
        if (result.isErr()) {
          console.error(`logout() ${neverThrowErrorToString(result.error)}`);
        }
        break;
    }
  }

  async function handleUserLightDarkMenuSelect(details: SelectionDetails) {
    const action = details.value;
    console.debug(action);

    switch (action) {
      case "light-dark:light":
        lightDarkManager.setLightDark("light");
        break;
      case "light-dark:dark":
        lightDarkManager.setLightDark("dark");
        break;
      case "light-dark:system":
        lightDarkManager.setLightDark("system");
        break;
    }
  }
</script>

<div id="app" class="flex flex-col h-svh">
  <header>
    <AppBar class="bg-surface-50-950 border-b-surface-200-800 border-b-1 p-2">
      <AppBar.Toolbar class="grid-cols-[auto_1fr_auto]">
        <AppBar.Lead>
          <Popover>
            <Popover.Trigger class="btn-icon btn-icon-lg">
              <MenuIcon />
            </Popover.Trigger>

            <Portal>
              <Popover.Positioner>
                <Popover.Content
                  class="flex flex-col gap-4 bg-surface-100-900 card shadow dark:border-1 border-surface-200-800 p-4 w-80"
                >
                  <header class="flex gap-2 items-center">
                    <Menu onSelect={(details) => handleUserMenuSelect(details)}>
                      <Menu.Trigger
                        class="btn rounded-full size-8 text-center text-lg bg-secondary-400-600"
                      >
                        {data.user?.name.at(0)?.toUpperCase()}
                      </Menu.Trigger>
                      <Portal>
                        <Menu.Positioner>
                          <Menu.Content class="text-sm bg-surface-100-900">
                            <Menu.ItemGroup>
                              <Menu.ItemGroupLabel>Appearance</Menu.ItemGroupLabel>
                              <Menu onSelect={(details) => handleUserLightDarkMenuSelect(details)}>
                                <Menu.TriggerItem class="justify-start gap-2" value="light-dark">
                                  {#if lightDarkManager.current == "dark"}
                                    <MoonIcon class="size-4" />
                                  {:else if lightDarkManager.current == "light"}
                                    <SunIcon class="size-4" />
                                  {:else if lightDarkManager.current == "system"}
                                    <MonitorCogIcon class="size-4" />
                                  {/if}
                                  <Menu.ItemText>{lightDarkManager.current}</Menu.ItemText>
                                  <Menu.ItemIndicator class="ml-auto">
                                    <ChevronRightIcon class=" size-4" />
                                  </Menu.ItemIndicator>
                                </Menu.TriggerItem>
                                <Portal>
                                  <Menu.Positioner>
                                    <Menu.Content class="text-sm bg-surface-100-900">
                                      <Menu.Item value="light-dark:light">
                                        <SunIcon class="size-4" />
                                        <Menu.ItemText>Light</Menu.ItemText>
                                      </Menu.Item>
                                      <Menu.Item value="light-dark:dark">
                                        <MoonIcon class="size-4" />
                                        <Menu.ItemText>Dark</Menu.ItemText>
                                      </Menu.Item>
                                      <Menu.Item value="light-dark:system">
                                        <MonitorCogIcon class="size-4" />
                                        <Menu.ItemText>System</Menu.ItemText>
                                      </Menu.Item>
                                    </Menu.Content>
                                  </Menu.Positioner>
                                </Portal>
                              </Menu>
                            </Menu.ItemGroup>
                            <Menu.Separator />
                            <Menu.Item value="logout">
                              <LogOutIcon class="size-3.5" />
                              <Menu.ItemText>Logout</Menu.ItemText>
                            </Menu.Item>
                          </Menu.Content>
                        </Menu.Positioner>
                      </Portal>
                    </Menu>
                    <Popover.Title class="text-lg font-bold">{data.user?.name}</Popover.Title>
                    <span class="opacity-70 text-xs">{data.user?.role}</span>
                    <Popover.CloseTrigger class="ml-auto btn-icon hover:preset-tonal self-start">
                      <XIcon class="size-4" />
                    </Popover.CloseTrigger>
                  </header>

                  <div class="mt-6 flex flex-col gap-2 mr-20">
                    <div
                      class="flex items-center gap-2 p-2 rounded-sm hover:bg-surface-200-800 active:bg-surface-200-800"
                    >
                      <HomeIcon class="size-4" />
                      <a href="/">Home</a>
                    </div>
                    <div
                      class="flex items-center gap-2 p-2 rounded-sm hover:bg-surface-200-800 active:bg-surface-200-800"
                    >
                      <PenIcon class="size-4" />
                      <a href="/editor">Editor</a>
                    </div>
                    <div
                      class="flex items-center gap-2 p-2 rounded-sm hover:bg-surface-200-800 active:bg-surface-200-800"
                    >
                      <PaletteIcon class="size-4" />
                      <a href="/editor/themes">Themes</a>
                    </div>
                    <div
                      class="flex items-center gap-2 p-2 rounded-sm hover:bg-surface-200-800 active:bg-surface-200-800"
                    >
                      <KeyboardMusicIcon class="size-4" />
                      <a href="/editor/devices">Devices</a>
                    </div>
                    {#if ability.can("manage", "User")}
                      <div
                        class="flex items-center gap-2 p-2 rounded-sm hover:bg-surface-200-800 active:bg-surface-200-800"
                      >
                        <UserIcon class="size-4" />
                        <a href="/editor/users">Users</a>
                      </div>
                    {/if}
                  </div>
                </Popover.Content>
              </Popover.Positioner>
            </Portal>
          </Popover>
        </AppBar.Lead>
        <AppBar.Headline></AppBar.Headline>
        <AppBar.Trail class="items-center">
          <GridControls />
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
        </AppBar.Trail>
      </AppBar.Toolbar>
    </AppBar>
  </header>

  <main class="flex grow shrink-0 h-0">
    <aside
      id="left-panel"
      style={panelLayout.width.left ? `width: ${panelLayout.width.left}px` : ""}
      class="text-xs flex flex-col shrink-0 min-h-0 overflow-hidden"
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
            <UdtsTab />
          </Tabs.Content>
          <Tabs.Content value="pages" class="flex-1 min-h-0 overflow-y-auto">
            <PagesTab />
          </Tabs.Content>
        </Tabs>

        {#snippet pending()}
          <div class="flex flex-col grow gap-2 p-2">
            {#each Array.from({ length: 20 }) as _, i}
              <div class="bg-surface-200-800 grow rounded-md animate-pulse"></div>
            {/each}
          </div>
        {/snippet}
        {#snippet failed(error, reset)}
          <p class="text-error-700-300">{error}</p>
          <button onclick={reset} class="btn preset-filled">reset</button>
        {/snippet}
      </svelte:boundary>
    </aside>
    <button
      class="w-1 bg-surface-200-800 cursor-col-resize hover:bg-surface-300-700 active:bg-primary-600-400 hover:px-1.5 hover:-mx-0.75"
      onpointerdown={() => {
        panelLayout.dragging.left = true;
      }}
      title="drag to resize left panel"
    ></button>

    <main id="center-panel" class="grow min-w-0 flex flex-col overflow-scroll">
      {@render children?.()}
    </main>
    <button
      class="w-1 bg-surface-200-800 cursor-col-resize hover:bg-surface-300-700 active:bg-primary-600-400 hover:px-1.5 hover:-mx-0.75"
      onpointerdown={() => {
        panelLayout.dragging.right = true;
      }}
      title="drag to resize right panel"
    ></button>

    <aside
      id="right-panel"
      class="shrink-0 overflow-y-auto"
      style={panelLayout.width.right ? `width: ${panelLayout.width.right}px` : ""}
    >
      {#if editor.activePage}
        <ElementsInsert />
        <div class="border-t border-surface-200-800">
          {#if editor.selectedElementIds.length > 1}
            <MultiElementProperties />
          {:else if editor.selectedElementIds.length === 1}
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
