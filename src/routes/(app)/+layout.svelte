<script lang="ts">
  import "../styles.css";
  import Hamburger from "$lib/client/componets/Hamburger.svelte";
  import { io } from "socket.io-client";
  import { ClientTag } from "$lib/client/tag/tagState.svelte";
  import { onMount } from "svelte";

  const { children, data } = $props();

  let menuOpen = $state(false);
  function closeMenu() {
    menuOpen = false;
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
    <h2>Title</h2>
    <div class="corner">
      {#if data.user}
        <span>{data.user.email}</span>
        <form id="logout" action="/api/logout?/logout" method="POST">
          <button type="submit" class="secondary">logout</button>
        </form>
      {/if}
    </div>
  </header>

  <section>
    <nav class={menuOpen ? "" : "closed"}>
      <a href="/" onclick={closeMenu}>Home</a>
      <a href="/scada" onclick={closeMenu}>Scada</a>
      <a href="/scada/tags" onclick={closeMenu}>Tags</a>
    </nav>

    <main>
      {@render children()}
    </main>
  </section>
</div>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: var(--app-color-neutral-400);
    width: 100svw;
    height: var(--app-header-height);
    z-index: 1;
  }

  header h2 {
    margin: 0;
  }

  header .corner {
    display: flex;
    align-items: center;
    flex-direction: column;
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
  }

  nav {
    display: flex;
    flex-grow: 0;
    flex-direction: column;
    justify-content: start;
    background-color: brown;
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

  /*on mobile show hamburger and have a closable side menu*/
  @media only screen and (max-aspect-ratio: 0.7) {
    nav {
      position: absolute;
      padding-top: 3rem; /*space for the header*/
      top: 0;
      left: 0;
      bottom: 0;
      box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.2);
    }
    nav.closed {
      display: none;
    }

    .hamburger {
      display: block;
    }
  }
</style>
