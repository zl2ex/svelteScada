import { writable, type Writable } from "svelte/store";
import { tags, type Tags } from '$lib/tag/tags';

let tagStore: Tags = tags;

tagStore.aprt01.data.value = !tagStore.aprt01.data.value;

/*
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

    return {
        ...tag


    };
}   */