import type { ViteDevServer } from 'vite';
import { server } from './socketIoHandler';

export const webSocketServer = {
    name: 'webSocketServer',
    configureServer(viteServer: ViteDevServer) {
        server.injectSocketIO(viteServer.httpServer);
    }
};