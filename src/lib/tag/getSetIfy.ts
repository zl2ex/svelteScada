
// pass any object or array and specify events to run when properties are accessed
export function getSetIfy(obj: any, path: string, getCb: Function, setCb: Function)
{
	if(Array.isArray(obj)) 
	{
		let items = obj;
		for (let i = 0; i < obj.length; i++) 
		{
			getSetIfy(items[i], `${path}[${i}]`, getCb, setCb);
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
				obj[key] = getSetIfy(obj[key], `${path}.${key}`, getCb, setCb);
			}
			//console.log(`define properties ${path}.${key}`);
			Object.defineProperty(output, key, {
				get() { return getCb(`${path}.${key}`, obj[key]); },
				set(newVal)
				{
                    obj[key] = setCb(`${path}.${key}`, obj[key], newVal);
				},
				enumerable: true
			});
		}
		return output;
	} 
	else return obj;
}

