<script lang="ts">
  import { themeManager } from "$lib/client/theme.svelte";
  import "./layout.css";

  themeManager.loadTheme();

  let { children } = $props();
</script>

{@render children()}
