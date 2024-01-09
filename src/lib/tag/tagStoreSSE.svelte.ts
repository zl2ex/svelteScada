import { getSetIfy } from '$lib/tag/getSetIfy';
import { browser } from '$app/environment';
import { type Tags } from '$lib/tag/tags';

let tagsStore = $state<Tags>();

export function tagsRef()
{
    return tagsStore;
}

export function tagStoreInit(tagsInit: Tags)
{
    if(browser == false) 
    {
        tagsStore = tagsInit;
        return;
    }

    tagsStore = getSetIfy(tagsInit, "tags", 
	(path: string, value: any) => {
		return value;
	},
	(path: string, value: any, newValue: any) => {
		console.log('setting', path, newValue);
		value = newValue;
		let sse = new EventSource('/sse');
		sse.onmessage = () => {
            console.log("SSE Event on client");
        };
        return value;
	});
}