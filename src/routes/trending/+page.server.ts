import type { RequestEvent } from './$types';
import { TrendModel } from '$lib/mongoose/trend/trend';

export const ssr = false;

function randomInt()
{
    return Math.round(Math.random() * 10);
}

export async function load()
{
    let attx01 = [];
    let attx02 = [];

    for(let i = 0; i < 600; i++)
    {
        attx01[i] = {time: Date.now() + i * 1000, value: randomInt()};
        attx02[i] = {time: Date.now() + i * 1000, value: randomInt()};
        //TrendModel.create({time: Date.now() + i * 1000, value: randomInt(), unit: '*C'})
    }

    return {
        trending: [{label: "attx01", unit: "*C", data: attx01}, {label: 'attx02', data: attx02 }]
    };
}


export const actions = {
    trends: async ({ cookies, request }: RequestEvent) => {
        console.log(request.body);
    }
};

