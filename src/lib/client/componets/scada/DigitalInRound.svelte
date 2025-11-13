<script lang="ts">
  import type { BaseTagServer } from "$lib/tag/server/baseTag";
  import type { MouseEventHandler } from "svelte/elements";

  type props = {
    tag: BaseTagServer<DigitalIn>;
    style?: string;
    onclick?: MouseEventHandler<SVGSVGElement>;
    faultFlash?: boolean;
  };

  let { tag, style = "", onclick, faultFlash = false }: props = $props();

  let c = $state("fault"); // default state

  $effect(() => {
    c = "";
    if (tag.data.value) c = "on";
    if (tag.data.fault && faultFlash && flash.isOn) c = "fault";
  });
</script>

<span>{tag.name}</span>
<svg viewBox="0 0 60 60" class={c} {style} {onclick} role="button" tabindex="0">
  <g stroke-width="5%">
    <text>T</text>
    <circle cx="50%" cy="50%" r="45%"></circle>
  </g>
</svg>

<style>
  svg {
    fill: var(--app-color-neutral-400);
    stroke: var(--app-color-neutral-000);
  }

  text {
    font: italic 6px serif;
    fill: var(--app-color-neutral-000);
  }

  p {
    font-size: 0.6rem;
    margin: 0;
  }

  .on {
    fill: var(--app-color-state-on);
  }

  .fault {
    fill: var(--app-color-state-fault);
  }
</style>
