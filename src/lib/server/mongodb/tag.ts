import db from "./db";
import { type TagOptions } from "../tag/tag";
/*
export class Tag<T>
{
    name: string;
    opcuaPath: string;
    data: T;
    enabled: boolean;

    opcuaSubscription: ClientSubscription;

    constructor(init: BaseTagServerInit<T>)
    {
        this.name = init.name;
        this.opcuaPath = init.opcuaPath;
        this.data = init.data;
        this.enabled = true;
    }

    async init()
    {
        this.opcuaSubscription = await server.opcua.session.createSubscription2({
            requestedPublishingInterval: 250,
            requestedMaxKeepAliveCount: 50,
            requestedLifetimeCount: 6000,
            maxNotificationsPerPublish: 1000,
            publishingEnabled: true,
            priority: 10,
        });

        this.opcuaSubscription.on("keepalive", function () {
            console.log("keepalive");
        });

        this.opcuaSubscription.on("terminated", function () {
            console.log(" TERMINATED ------------------------------>");
        });

        const itemToMonitor = {
            nodeId: this.opcuaPath,
            attributeId: AttributeIds.Value,
        };

        const parameters = {
            samplingInterval: 100,
            discardOldest: true,
            queueSize: 100,
        };

        const monitoredItem = await this.opcuaSubscription.monitor(
            itemToMonitor,
            parameters,
            TimestampsToReturn.Both
        );

        monitoredItem.on("changed", (dataValue) => {
            console.log(dataValue.value.toString());

            server.io.sockets.emit("message", {
                value: dataValue.value.value,
                timestamp: dataValue.serverTimestamp,
                nodeId: this.opcuaPath,
                browseName: "Temperature",
            });
        });
    }
}*/


export const tags = db.collection<TagOptions>('tags');
await tags.createIndex({ path: 1 }, { unique: true });

/*tags.insertOne({
        name: "test",
        path: "/demo/test",
        dataType: "Double",
        nodeId: "ns=1;s=[device]/fhr100",
        initialValue: 10.1123
    });*/