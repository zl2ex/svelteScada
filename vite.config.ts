import { sveltekit } from '@sveltejs/kit/vite';
import { type ViteDevServer, defineConfig } from 'vite';

import { BaseTagServer } from './src/lib/tag/baseTag';
import { Server } from 'socket.io';

import { webSocketServer } from './socketIoPluginVite';

/*
export const webSocketServer = {
	name: 'webSocketServer',
	configureServer(server: ViteDevServer) 
	{
		if (!server.httpServer) return;
		
		//BaseTagServer.socketIoInit(server.httpServer);

		const io = new Server(server.httpServer);

		/*
		function updateTag(tag: BaseTag<object>)
		{
			io.to(tag.name).emit("tag:update", tag);
		}

		function incrimentTest()
		{
			/*tags.attx01.data.value++;
			updateTag(tags.attx01);
			console.log(tags.attx01.data.value);
			test.data = {value: !test.data.value, fault: false};
			setTimeout(incrimentTest, 1000);
		}

		//incrimentTest();
		
		io.on("connection", (socket) => {

			console.log("socket connected  id " + socket.id);
			
			socket.on("disconnect", () => {
				console.log("socket disconnected  id " + socket.id);
			})

			/*
			// get a list of tags, same as a GET request basically
			socket.on("tags:read", (names: string[]) => {
				let ret:any = {};
				for(let name of names)
				{
					if(name in tags) // tags object has that paticular tag
					{
						ret[name] = tags[name as keyof typeof tags];
					}
				}
				console.log("tags:read " + names);
				io.emit("tags:read", ret);
			});

			// update tag infomation on server, 
			// then emit an event to update tag on subscribed clients
			socket.on("tag:update", (tag:BaseTag<object>) => {
				console.log("tags:update " + tag.name);

				// no key of that name in tags
				if((tag.name in tags) == false) 
				{
					console.error(`cant find ${tag.name} in tags object. please check name`);
					return; 
				}

				tags[tag.name as keyof typeof tags] = tag;
				console.log(tag);
				io.to(tag.name).emit("tag:update", tag);
			});

			// subscribe to update events on that paticular tag
			socket.on("tags:subscribe", (names: string[]) => {
				for(let name of names)
				{
					// tags object has that paticular tag
					if(name in tags) socket.join(name);
					else console.log(`subscribe to ${name} failed no tag with that name exists`);
				}
				console.log("tags:subscribe " + names);
			});

			socket.on("tags:unsubscribe", (names: string[]) => {
				for(let name of names)
				{
					// tags object has that paticular tag
					if(name in tags) socket.leave(name);
					else console.log(`unsubscribed from ${name} failed no tag with that name exists`);
				}
				console.log("tags:unsubscribe " + names);
			});
			
		});

	}
};

*/


export default defineConfig({
	plugins: [sveltekit(), webSocketServer]
});

