import { sveltekit } from '@sveltejs/kit/vite';
import { type ViteDevServer, defineConfig } from 'vite';

import { Server } from 'socket.io';

const webSocketServer = {
	name: 'webSocketServer',
	configureServer(server: ViteDevServer) 
	{
		if (!server.httpServer) return;
		const io = new Server(server.httpServer)
		io.on("connection", (socket) => {
			socket.on("disconnect", () => {
				console.log("socket disconnect");
			})

			socket.on("subscribe", (topics) => {
				socket.join(topics);
				console.log(topics);
			});
			
			socket.on("unsubscribe", (topic) => {
				socket.leave(topic);
			});



			socket.on("aprt01", (value) => {
				console.log(value);
				io.emit("aprt01", value);
			});
			
			// send an event only to clients that have shown interest in the "foo" topic
		});
	}
}

export default defineConfig({
	plugins: [sveltekit(), webSocketServer]
});
