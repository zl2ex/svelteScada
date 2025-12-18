import { json } from "@sveltejs/kit";
//import { TrendModel } from '$lib/mongoose/trend/trend.js';

export async function GET({ url }) {
  const trendData = null; //await TrendModel.find({unit: "*C"})
  const tagName = String(url.searchParams.get("tagName"));

  return json(trendData);
}
