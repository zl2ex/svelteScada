import type { RequestHandler } from './$types';

type DigitalIn = {
    value: boolean;
    fault: boolean;
}

type BaseTag = {
    name: string;
    data: object;
    enabled: boolean;

};

export const GET: RequestHandler = async ({url}) => {

    const name = url.searchParams.get("name");

    console.log(name);
    let tag: BaseTag = {
        name: "test",
        data: {value: true, fault: false},
        enabled: true
    }

    console.log(tag);
    return new Response(Object(tag));
};