<script lang="ts">
  import Hamburger from "$lib/client/componets/Hamburger.svelte";
  import { io } from "socket.io-client";
  import { ClientTag } from "$lib/client/tag/tagState.svelte";
  import { browser } from "$app/environment";
  import { setTheme, type Theme } from "$lib/client/theme.js";

  const { children, data } = $props();

  let menuOpen = $state(false);
  function closeMenu() {
    menuOpen = false;
  }

  let savedTheme: Theme = "system";
  if (browser) {
    // On load, restore saved preference for light or dark theme
    let savedTheme: Theme = localStorage.getItem("theme") as Theme;
    if (!savedTheme) {
      savedTheme = "system";
    }
    setTheme(savedTheme);
  }

  const socket = io();
  socket.on("connect", () => {
    console.log("socketIO Connected");
  });

  ClientTag.initSocketIo(socket);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="app">
  <header>
    <div class="corner">
      <div class="hamburger"><Hamburger bind:active={menuOpen} /></div>
    </div>
    <div class="corner">
      <button
        popovertarget="profile-menu"
        id="profile-button"
        aria-label="profile menu"
      >
        <svg viewBox="0 0 100 100">
          <g stroke-width="4px" stroke-linecap="round" stroke-linejoin="round">
            <circle r="40" cx="50px" cy="50px"></circle>
            <circle r="12" cx="50px" cy="35px"></circle>
            <path d="M 15 70 C 30 60, 33 50, 40 52 S 42 58, 50 58"></path>
            <path d="M 85 70 C 70 60, 67 50, 60 52 S 58 58, 50 58"></path>
          </g>
        </svg>
      </button>

      <div popover id="profile-menu">
        {#if data.user}
          <p>{data.user.email}</p>

          <label
            >Theme:
            <select
              data-theme-picker
              name="themepicker"
              id="theme-picker"
              value={savedTheme}
              onchange={setTheme}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>

          <form id="logout" action="/api/logout?/logout" method="POST">
            <button type="submit" class="secondary">logout</button>
          </form>
        {/if}
      </div>
    </div>
  </header>

  <section>
    <nav class={menuOpen ? "" : "closed"}>
      <a href="/" onclick={closeMenu}>Home</a>
      <a href="/scada" onclick={closeMenu}>Scada</a>
      <a href="/editor/tags" onclick={closeMenu}>Edit Tags</a>
      <a href="/editor/devices" onclick={closeMenu}>Edit Devices</a>
    </nav>

    <main onclick={closeMenu}>
      {@render children()}
    </main>
  </section>
</div>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: var(--app-color-neutral-300);
    height: var(--app-header-height);
  }

  .corner {
    display: flex;
    align-items: center;
    flex-direction: column;
    position: relative;
  }

  section {
    display: flex;
    flex-direction: row;
  }

  main {
    height: var(
      --app-main-content-height
    ); /*space for the header  has to have a height for overflow-y: auto*/
    flex-grow: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  nav {
    display: flex;
    flex-grow: 0;
    flex-direction: column;
    justify-content: start;
    background-color: var(--app-color-secondary-500);
    z-index: 10;
  }

  nav a {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.5rem;
    color: inherit;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.1rem;
    text-decoration: none;
  }

  .hamburger {
    display: none;
  }

  #profile-button {
    background-color: transparent;
    padding: 0.4rem;
    border: none;
    anchor-name: --profile-button;

    svg {
      width: 2rem;
      stroke: var(--app-text-color);
      fill: transparent;
    }
  }
  #profile-menu {
    color: var(--app-text-color);
    background-color: var(--app-color-neutral-200);
    border: 0;
    padding: 1rem;
    font-size: 0.8rem;
    border-radius: 0.2rem;

    position-anchor: --profile-button;
    position: absolute;
    inset: auto;
    margin: 0;
    top: anchor(bottom);
    right: anchor(right);

    margin-top: 0.5rem;
    margin-right: 0.5rem;

    box-shadow:
      inset 1px 1px 20px var(--app-color-box-shadow-inset),
      6px 6px 20px var(--app-color-box-shadow);

    form {
      text-align: center;
    }
  }

  /*on mobile show hamburger and have a closable side menu*/
  @media only screen and (max-aspect-ratio: 0.7) {
    nav {
      position: absolute;
      padding-top: 3rem; /*space for the header*/
      top: 0;
      left: 0;
      bottom: 0;
      box-shadow:
        inset 1px 1px 20px var(--app-color-box-shadow-inset),
        6px 6px 20px var(--app-color-box-shadow);
    }
    nav.closed {
      display: none;
    }

    .hamburger {
      display: block;
    }
  }
</style>
