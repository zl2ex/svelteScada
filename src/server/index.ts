/*import http from 'http';
import express from 'express';
import { server } from './socketIoHandler';
import { handler } from '../build/handler';


const app = express();
const httpServer = http.createServer(app);

// Inject SocketIO
server.injectSocketIO(httpServer);

// SvelteKit handlers
app.use(handler);

httpServer.listen(3000, () => {
    console.log('Running on http://localhost:3000');
});

*/

import express from "express";
import { createServer, Server } from "http";
import { handler } from '../../build/handler';
import { creatSocketIoServer } from "../lib/server/socket.io/socket.io";
import { createOPCUAServer, startOPCUAClient } from "../lib/server/opcua/opcuaServer";
import { logger } from "../lib/pino/logger";

const app = express();
const httpServer = createServer(app);

// SvelteKit handlers
app.use(handler);

export async function main(httpServer: Server) {
  creatSocketIoServer(httpServer);
  await createOPCUAServer();
  startOPCUAClient();

  //httpServer.listen(3000);
}

//main(httpServer);
