import { Server } from 'socket.io';

export default function injectSocketIO(server) {
    const io = new Server(server, {
        cors: {
            origin: "http://localhost:4173"
        }
    });

    io.on('connection', (socket) => {
        console.log("socket connected  id " + socket.id);
			
        socket.on("disconnect", () => {
            console.log("socket disconnected  id " + socket.id);
        });
    });

    console.log('SocketIO injected');
}