import { defineConfig } from "vite";
import lucidePreprocess from "vite-plugin-lucide-preprocess";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import uws from "svelte-adapter-uws/vite";
import realtime from "svelte-realtime/vite";

export default defineConfig({
  plugins: [lucidePreprocess(), tailwindcss(), sveltekit(), uws(), realtime({ devtools: true })],
  optimizeDeps: {
    exclude: ["node-opcua", "node-opcua-client"],
  },
  // Ignore the specific folder and all its contents
  server: {
    watch: { ignored: ["**/your-folder-name/**"] },
  },
});
