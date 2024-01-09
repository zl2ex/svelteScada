import http from 'http';
import express from 'express';
import { server } from './socketIoHandler';
import { handler } from '../build/handler';

const app = express();
const httpServer = http.createServer(app);

// Inject SocketIO
server.injectSocketIO(httpServer);

// SvelteKit handlers
app.use(handler);

server.listen(3000, () => {
    console.log('Running on http://localhost:3000');
});