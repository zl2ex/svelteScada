import type { opcuaBrowseNodes } from './+server.js';

export async function load({ fetch })
{
    let opcuaNodes:opcuaBrowseNodes[] = await (await fetch("?browse=RootFolder", { method: "GET" })).json();

    return {
        opcuaNodes
    };
}


