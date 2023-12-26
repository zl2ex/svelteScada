import { sveltekit } from '@sveltejs/kit/vite';
import { type ViteDevServer, defineConfig } from 'vite';

import { webSocketServer } from './server/socketIoPluginVite';

export default defineConfig({
	plugins: [sveltekit(), webSocketServer]
});

