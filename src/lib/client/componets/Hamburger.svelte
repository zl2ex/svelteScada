<script lang="ts">
  type props = {
    active: boolean;
  };

  let { active = $bindable() }: props = $props();

  function toggleActive() {
    active = !active;
  }
</script>

<div class="Hamburger">
  <button onclick={toggleActive} class="hamburger" aria-label="Toggle Menu">
    <svg
      viewBox="0 0 60 40"
      class={active ? " hamburgerAnimation active" : "hamburgerAnimation"}
    >
      <g stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <line class="top" x1="15%" y1="15%" x2="85%" y2="15%"></line>
        <line class="middle" x1="15%" y1="50%" x2="85%" y2="50%"></line>
        <line class="bottom" x1="15%" y1="85%" x2="85%" y2="85%"></line>
      </g>
    </svg>
  </button>
</div>

<style>
  button {
    background: inherit;
    border: none;
    outline: none;
    padding: 0;
    position: relative;
    z-index: 20;
  }

  button:focus {
    outline: none;
  }

  .hamburgerAnimation {
    width: 3rem;
    padding: 10px;
    stroke: var(--app-text-color);
  }

  .top,
  .middle,
  .bottom {
    transition: 0.1s;
  }

  .active .top {
    transform-origin: top left;
    transform: translate(25%, -5%) rotate(45deg) scaleX(0.85);
  }

  .active .middle {
    opacity: 0;
  }

  .active .bottom {
    transform-origin: bottom left;
    transform: translate(25%, 5%) rotate(-45deg) scaleX(0.85);
  }
</style>
