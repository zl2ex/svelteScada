import { writable, type Writable } from "svelte/store";
import type { BaseTag } from '$lib/tag/baseTag';


export function createTagStore<T>(name:string, data:T)
{   
    const tag: Writable<BaseTag<T>> = writable({
        name: name,
        data: data,
        enabled: true
    });
    /*
    // client to server
    function set(data:T)
    {
        
    }

    // client to server
    function update()
    {
        
    }
*/
    return {
        ...tag


    };
}   