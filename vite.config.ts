import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import uws from "svelte-adapter-uws/vite";
import realtime from "svelte-realtime/vite";

export default defineConfig({
  plugins: [sveltekit(), uws(), realtime(), tailwindcss()],
  server: {
    watch: {
      // ignore the sqlite database file and prevent HMR on every write to database
      ignored: ["**/src/lib/server/sqlite/database/**"],
    },
  },
});
