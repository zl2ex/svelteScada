import type { RequestEvent } from './$types';

let data = 22;

export async function load()
{
    return {
        data
    };
}


export const actions = {
    update: async ({ cookies, request }: RequestEvent) => {
        const formData = await request.formData();
        data = Number(formData.get('number'));
        console.log(data);
    }
};

