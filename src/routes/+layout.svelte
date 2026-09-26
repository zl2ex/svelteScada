<script lang="ts">
  import { themeManager } from "$lib/client/theme.svelte";
  import { neverThrowErrorToString } from "$lib/util/neverThrow";
  import "./layout.css";

  const loaded = themeManager.loadTheme();
  if (loaded.isErr()) {
    console.error(neverThrowErrorToString(loaded.error));
  }

  let { children } = $props();
</script>

{@render children()}
