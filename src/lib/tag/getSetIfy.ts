
// pass any object or array and specify events to run when properties are accessed
export function getSetIfy(obj: any, path: string, getCb: Function, setCb: Function, initCb: Function): any
{
	/*if(Array.isArray(obj)) 
	{
		let items = [];
		for (let i = 0; i < obj.length; i++) 
		{
			console.log(`define items ${path}[${i}]`);
			items[i] = getSetIfy(obj[i], `${path}[${i}]`, getCb, setCb, initCb);
		}
		return items;
	} 
	else */if(typeof obj === 'object')
	{
		let output = {};
		for(let key in obj) 
		{
			let path_key = `${path}.${key}`;
			if(typeof obj[key] === 'object') 
			{
				obj[key] = getSetIfy(obj[key], path_key, getCb, setCb, initCb);
			}
			console.log(`define properties ${path_key}`);
			Object.defineProperty(output, key, {
				get() { return getCb(path_key, obj[key]); },
				set(newVal)
				{
                    obj[key] = setCb(path_key, obj[key], newVal);
				},
				enumerable: true
			});

			initCb(path_key, obj[key]);
		}
		return output;
	} 
	else
	{
		console.error("please provide an object    this is not an object :", obj);
		return obj;
	}
}

