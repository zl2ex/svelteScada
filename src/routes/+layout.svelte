<script lang="ts">
  import { browser } from "$app/environment";
  import { setTheme, type Theme } from "$lib/client/theme";
  import "./styles.css";
  let { children } = $props();

  if (browser) {
    // On load, restore saved preference for light or dark theme
    let savedTheme: Theme = localStorage.getItem("theme") as Theme;
    if (!savedTheme) {
      savedTheme = "system";
    }
    setTheme(savedTheme);
  }
</script>

{@render children()}
