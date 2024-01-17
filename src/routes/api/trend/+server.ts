import { json } from '@sveltejs/kit';
import { TrendModel } from '$lib/mongoose/trend/trend.js';

export async function GET({ url }) {

    const trendData = await TrendModel.find({unit: "*C"})
    const tagName = String(url.searchParams.get('tagName'));
    console.log(trendData);
    
    return json(trendData);
}