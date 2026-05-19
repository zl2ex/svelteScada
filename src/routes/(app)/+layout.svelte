<script lang="ts">
  import { io } from "socket.io-client";
  import { ClientTag } from "$lib/client/tag/clientTag.svelte.js";
  import { browser } from "$app/environment";

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

  const { children, data } = $props();

  let menuOpen = $state(false);
  function closeMenu() {
    menuOpen = false;
  }

  const themes = ["system", "light", "dark"] as const;
  type Theme = (typeof themes)[number];

  let savedTheme: Theme = $state("system");

  export function setTheme(newTheme: Theme) {
    savedTheme = newTheme;
    document.documentElement.setAttribute("data-mode", newTheme);
    localStorage.setItem("theme", newTheme);
  }

  if (browser) {
    // On load, restore saved preference for light or dark theme
    let savedTheme: Theme = localStorage.getItem("theme") as Theme;
    if (!savedTheme) {
      savedTheme = "system";
    }
    setTheme(savedTheme);
  }

  const links = [
    { label: "Home", href: "/", icon: HouseIcon },
    { label: "Edit Tags", href: "/editor/tags", icon: TagIcon },
    { label: "Edit Devices", href: "/editor/devices", icon: CpuIcon },
  ];

  const socket = io();
  socket.on("connect", () => {
    console.log("[+layout.svelte] socketIO Connected");
  });

  ClientTag.initSocketIo(socket);
</script>

<div id="app" class="bg-surface-200-800">
  <header>
    <AppBar>
      <AppBar.Toolbar class="grid-cols-[auto_1fr_auto]">
        <AppBar.Lead>
          <button type="button" class="btn-icon btn-icon-lg hover:preset-tonal"
            ><MenuIcon /></button
          >
        </AppBar.Lead>
        <AppBar.Headline>
          <p class="text-2xl">Shit Scada</p>
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
                <Popover.Content class="card p-4 bg-surface-200-800 shadow-xl">
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
                      <nav
                        class="btn-group flex-row preset-outlined-surface-300-700"
                      >
                        {#each themes as theme}
                          <button
                            type="button"
                            class="btn capitalize"
                            class:preset-filled={theme == savedTheme}
                            data-theme-picker
                            onclick={() => setTheme(theme)}
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

  <section
    class="w-full grid grid-cols-[auto_1fr] items-stretch border border-surface-200-800"
  >
    <!-- --- -->
    <Navigation layout="sidebar">
      <Navigation.Content>
        <Navigation.Header>
          <Navigation.Trigger onclick={() => {}}></Navigation.Trigger>
        </Navigation.Header>
        <Navigation.Menu>
          {#each links as link}
            {@const Icon = link.icon}
            <Navigation.TriggerAnchor href={link.href}>
              <Icon class="size-4" />
              <Navigation.TriggerText>{link.label}</Navigation.TriggerText>
            </Navigation.TriggerAnchor>
          {/each}
        </Navigation.Menu>
      </Navigation.Content>
    </Navigation>
    <!-- --- -->
    <main>
      {@render children()}
    </main>
  </section>
</div>
