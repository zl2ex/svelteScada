import { EventEmitter } from 'node:events';
import { tagsInit, type Tags } from '$lib/tag/tags';
import { type BaseTag } from '$lib/tag/baseTag';
import { getSetIfy } from '$lib/tag/getSetIfy';

export let tagsSSE: Tags = getSetIfy(tagsInit, "tags", 
	(path: string, value: any) => {
		return value;
	},
	(path: string, value: any, newValue: any) => {
		console.log('setting', path, newValue);
		value = newValue;
		const sse = new EventEmitter();
		//sse.emit(`${path}:update`, value);
		sse.emit('tag');
		return value;
	});


	console.log("tagsSEE", tagsSSE);
	console.log("tagsInit", tagsInit);

	tagsSSE.aprt01.data.value = true;

	console.log("tagsSSE.aprt01.data.value", tagsSSE.aprt01.data.value);
	console.log("tagsInit.aprt01.data.value", tagsInit.aprt01.data.value);


	setInterval(log, 1000);
	function log()
	{
		tagsSSE.aprt01.data.value = !tagsSSE.aprt01.data.value;
	}
/*
function objectSSE(obj: any, topic: string)
{
	if(Array.isArray(obj)) 
	{
		let items = obj;
		for (let i = 0; i < obj.length; i++) 
		{
			objectSSE(items[i], `${topic}[${i}]`);
		}
		return items;
	} 
	else if(typeof obj === 'object')
	{
		let output = {};
		for(let key in obj) 
		{
			if(typeof obj[key] === 'object') 
			{
				obj[key] = objectSSE(obj[key], `${topic}.${key}`);
			}
			console.log(`define properties ${topic}.${key}`);
			Object.defineProperty(output, key, {
				get() { return obj[key]; },
				set(val)
				{
					console.log('setting', key, val);
					let sse = new EventEmitter();
					sse.emit(`${topic}.${key}:update`, val);
					obj[key] = val;
				},
				enumerable: true
			});
		}
		return output;
	} 
	else return obj;
}

*/





export class tagEvent extends EventEmitter {
	notify() {
		this.emit('tag');
	}
}

export const tag_events: tagEvent[] = [];

export function updateTag(tag: BaseTag<object>) {

	// push updates to client 
	/*
	tags.push(tag);
	for (const event of tag_events) {
		event.notify();
	}*/
}
