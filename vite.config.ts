import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { mainServer } from "./src/server/serverPluginVite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), mainServer],
});
