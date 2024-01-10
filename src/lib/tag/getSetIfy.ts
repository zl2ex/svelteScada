
type getSetIfyProps = {
	obj: any;
	path: string;
	getCb?: Function;
	setCb?: Function;
	initCb?: Function;
}



// pass any object or array and specify events to run when properties are accessed
export function getSetIfy(p: getSetIfyProps): any
{
	if(typeof p.obj === 'object')
	{
		let output = {};
		for(let key in p.obj) 
		{
			let path_key = `${p.path}.${key}`;
			if(typeof p.obj[key] === 'object') 
			{
				p.obj[key] = getSetIfy({obj: p.obj[key], path: path_key, setCb: p.getCb, getCb: p.setCb, initCb: p.initCb});
			}
			console.log(`define properties ${path_key}`);
			if(p.initCb) p.initCb(path_key, p.obj[key]);
			if(p.getCb && p.setCb)
			{
				Object.defineProperty(output, key, {
					get() { return p.getCb(path_key, p.obj[key]); },
					set(newVal)
					{
						p.obj[key] = p.setCb(path_key, p.obj[key], newVal);
					},
					enumerable: true
				});
			}
		}
		return output;
	} 
	else
	{
		console.error("please provide an object    this is not an object :", obj);
		return p.obj;
	}
}

