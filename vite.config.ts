import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import uws from "svelte-adapter-uws/vite";
import realtime from "svelte-realtime/vite";
import lucidePreprocess from "vite-plugin-lucide-preprocess";

export default defineConfig({
  plugins: [lucidePreprocess(), sveltekit(), uws(), realtime(), tailwindcss()],
});
