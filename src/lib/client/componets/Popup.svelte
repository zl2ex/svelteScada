<script lang="ts">
  import { onMount, type Snippet } from "svelte";

  type props = {
    open: boolean;
    children?: Snippet;
  };

  let { children, open = $bindable() }: props = $props();

  let clazz = $derived(open ? "open" : "");

  let top = $state(0);
  let left = $state(0);
  let moving = $state(false);

  let clientWidth = $state(0);
  let clientHight = $state(0);

  function onPointerDown() {
    moving = true;
  }

  function onPointerMove(e) {
    if (moving) {
      left += e.movementX;
      top += e.movementY;

      if (top < 0) top = 0;
      if (left < 0) left = 0;

      if (top > window.innerHeight - clientWidth)
        top = window.innerHeight - clientWidth;
      if (left > window.innerWidth - clientHight)
        left = window.innerWidth - clientHight;
    }
  }

  function onPointerUp() {
    moving = false;
  }
</script>

<svelte:window onpointerup={onPointerUp} onpointermove={onPointerMove} />
<svelte:boundary>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="popup {clazz}"
    style="left: {left}px; top: {top}px;"
    aria-label="draggable"
    bind:clientWidth={clientHight}
    bind:clientHeight={clientWidth}
  >
    <header onpointerdown={onPointerDown}>
      <button
        type="button"
        id="close"
        onclick={() => (open = false)}
        aria-label="close popup"
      >
        <svg viewBox="0 0 100 100">
          <g stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
            <line x1="15%" y1="15%" x2="85%" y2="85%"></line>
            <line x1="15%" y1="85%" x2="85%" y2="15%"></line>
          </g>
        </svg>
      </button>
    </header>

    {#if children}
      {@render children()}
    {:else}
      <h1>popup</h1>
    {/if}
  </div>

  {#snippet pending()}
    <p>loading...</p>
  {/snippet}
  {#snippet failed(error, reset)}
    <p>{error}</p>
    <button onclick={reset} class="primary">oops! try again</button>
  {/snippet}
</svelte:boundary>

<style>
  .popup {
    position: absolute;
    z-index: 50;
    background-color: var(--app-color-neutral-300);
    visibility: hidden;
    /* border: 0.1rem solid var(--app-color-neutral-200);*/
    border-radius: 0.2rem;
    overflow-y: auto;
    max-height: 100svh;

    box-shadow:
      inset 1px 1px 20px var(--app-color-box-shadow-inset),
      6px 6px 20px var(--app-color-box-shadow);
  }

  header {
    position: sticky;
    top: 0;
    z-index: 4;
    display: flex;
    justify-content: end;
    background-color: var(--app-color-neutral-500);
    touch-action: none; /*allow for drag on mobile*/
  }

  .open {
    visibility: visible;
  }

  #close {
    display: flex;
    padding: 0;
    background-color: inherit;
    border: inherit;

    svg {
      stroke: var(--app-text-color);
      height: if(style(--app-screen-platform: mobile): 1.5rem; else: 1rem;);
      margin: 0.2rem;
    }
  }
</style>
