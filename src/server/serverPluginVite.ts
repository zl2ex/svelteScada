import type { ViteDevServer } from 'vite';
import { main } from './index';

export const mainServer = {
    name: 'mainServer',
    configureServer(viteServer: ViteDevServer) {
        main(viteServer.httpServer);
    }
};