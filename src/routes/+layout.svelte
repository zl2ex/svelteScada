<script lang="ts">
  import { lightDarkManager } from "$lib/client/lightDark.svelte";
  import { neverThrowErrorToString } from "$lib/util/neverThrow";
  import "./layout.css";

  const loaded = lightDarkManager.loadLightDark();
  if (loaded.isErr()) {
    console.error(neverThrowErrorToString(loaded.error));
  }

  let { children } = $props();
</script>

{@render children()}
