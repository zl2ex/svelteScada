import { writable, type Writable } from "svelte/store";
import type { BaseTag } from '$lib/tag/baseTag';


export function createTagStore<T>()
{   
    const tag: Writable<BaseTag<T>> = writable();
    /*
    function set()
    {
        
    }*/

    return {
        ...tag
    };
}