import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

import { mainServer } from './src/server/serverPluginVite';

export default defineConfig({
	plugins: [sveltekit(), mainServer]
});

