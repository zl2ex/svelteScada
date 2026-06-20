<script lang="ts">
  import { io } from "socket.io-client";
  import { ClientTag } from "$lib/client/tag/clientTag.svelte.js";

  import {
    CircleUserIcon,
    MenuIcon,
    SearchIcon,
    ThermometerSnowflake,
    User,
    XIcon,
    ArrowLeftRightIcon,
    BikeIcon,
    BookIcon,
    HouseIcon,
    TreePalmIcon,
    TagIcon,
    CpuIcon,
  } from "@lucide/svelte";
  import {
    AppBar,
    Avatar,
    Popover,
    Portal,
    Navigation,
  } from "@skeletonlabs/skeleton-svelte";
  import { themeManager } from "$lib/client/theme.svelte.js";

  const { children, data } = $props();

  const socket = io();
  socket.on("connect", () => {
    console.log("[+layout.svelte] socketIO Connected");
  });

  ClientTag.initSocketIo(socket);
</script>

<div id="app">
  <header>
    <AppBar class="bg-surface-50-950">
      <AppBar.Toolbar class="grid-cols-[auto_1fr_auto]">
        <AppBar.Lead>
          <button type="button" class="btn-icon btn-icon-lg hover:preset-tonal"
            ><MenuIcon /></button
          >
        </AppBar.Lead>
        <AppBar.Headline>
          <h3 class="h3">Shit Scada</h3>
        </AppBar.Headline>
        <AppBar.Trail>
          <button type="button" class="btn-icon hover:preset-tonal"
            ><SearchIcon class="size-8" /></button
          >

          <Popover>
            <Popover.Trigger class="btn-icon hover:preset-tonal">
              <CircleUserIcon class="size-8" />
            </Popover.Trigger>
            <Portal>
              <Popover.Positioner>
                <Popover.Content class="card p-4 bg-surface-100-900 shadow-xl">
                  <header class="flex justify-between">
                    <Popover.Title class="text-lg font-bold"
                      >{data.user?.email}</Popover.Title
                    >
                    <Popover.CloseTrigger
                      class="btn-icon hover:preset-tonal self-start"
                    >
                      <XIcon class="size-4" />
                    </Popover.CloseTrigger>
                  </header>

                  <Popover.Description></Popover.Description>
                  <div class="">
                    <div>
                      <form
                        id="logout"
                        action="/api/logout?/logout"
                        method="POST"
                      >
                        <button type="submit" class="btn preset-filled"
                          >logout</button
                        >
                      </form>
                      <a class="anchor block" href="/editor">editor</a>
                      <nav class="btn-group preset-outlined-surface-300-700">
                        {#each themeManager.themes as theme}
                          <button
                            type="button"
                            class="btn capitalize"
                            class:preset-filled={theme == themeManager.theme}
                            data-theme-picker
                            onclick={() => themeManager.setTheme(theme)}
                          >
                            {theme}
                          </button>
                        {/each}
                      </nav>
                    </div>
                  </div></Popover.Content
                >
              </Popover.Positioner>
            </Portal>
          </Popover>
        </AppBar.Trail>
      </AppBar.Toolbar>
    </AppBar>
  </header>

  <main>
    {@render children()}
  </main>
</div>
