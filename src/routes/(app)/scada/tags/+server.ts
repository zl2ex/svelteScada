/*import { error, type RequestEvent } from '@sveltejs/kit';
import { server } from "../../../../../server/";
import { NodeClass } from 'node-opcua';

export type opcuaBrowseNodes = {
    browseName: string;
    nodeId: string;
    nodeClass: string;
    value?: any;
};


function nodeClassString(num: NodeClass):string {
    return NodeClass[num];
}



export async function GET({ request, url }: RequestEvent) {

    let browse = url.searchParams.get("browse");

    if(!browse) error(403, { message: "no browse parameter provided" });

    let opcBrowse = await server.opcua.session.browse(browse);
    if(!opcBrowse.references) error(403, { message: "no opcua nodes found with that browse string" }); 

    let res:opcuaBrowseNodes[] = [];
    for(let refrence of opcBrowse.references) {
        res.push({
            browseName: refrence.browseName.toString(),
            nodeId: refrence.nodeId.toString(),
            nodeClass: nodeClassString(refrence.nodeClass),
            value: 0
        });
    }

    console.log(opcBrowse.toJSON());

    return new Response(JSON.stringify(res));
}*/