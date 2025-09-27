<script lang="ts">
  import "../styles.css";
  import Hamburger from "$lib/client/componets/Hamburger.svelte";
  import { io } from "socket.io-client";
  import { ClientTag } from "$lib/client/tag/tagState.svelte";
  import { onMount } from "svelte";

  const { children, data } = $props();

  let menuOpen = $state(false);

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
      <Hamburger bind:active={menuOpen} />
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

  <aside>
    <nav class={menuOpen ? "" : "closed"}>
      <a href="/">Home</a>
      <a href="/scada">Scada</a>
      <a href="/scada/tags">Tags</a>
    </nav>
  </aside>

  <main>
    {@render children()}
  </main>
</div>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: var(--app-color-neutral-400);
    min-width: 100svw;
    position: sticky;
    top: 0;
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

  main {
    position: relative;
    left: 4.3rem;
    min-height: 100%;
  }

  aside {
    position: fixed;
    top: 2.75rem;
    bottom: 0;
    display: flex;
    flex: 0;
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

  footer {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }

  /*on mobile show hamburger and have a closable side menu*/
  @media only screen and (max-aspect-ratio: 0.7) {
    section nav {
      position: absolute;
      padding-top: 4rem;
      top: 0;
      left: 0;
      bottom: 0;
      box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.2);
    }

    section nav.closed {
      display: none;
    }

    .corner .Hamburger {
      display: block;
    }
  }
</style>
