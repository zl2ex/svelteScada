import type { ClientSession, ClientSubscription } from "node-opcua-client";
import { OPCUAClient, AttributeIds, TimestampsToReturn } from "node-opcua-client";

const nodeIdToMonitor = "ns=2;g=1D545837-3EDB-43F5-A4B8-073C0775FCBE";

export class OpcuaClient {

    client: OPCUAClient;
    session: ClientSession;
    subscription: ClientSubscription;
    endpointUrl: string;


    constructor(endpointUrl: string) {
        this.endpointUrl = endpointUrl;
    }

    async start() {
        try {

            this.client = OPCUAClient.create({
                endpointMustExist: false
            });

            this.client.on("backoff", (retry, delay) =>
                console.log(
                    "still trying to connect to ",
                    this.endpointUrl,
                    ": retry =",
                    retry,
                    "next attempt in ",
                    delay / 1000,
                    "seconds"
                )
            );

            await this.client.connect(this.endpointUrl);
            console.log("connected to ", this.endpointUrl)

            this.session = await this.client.createSession();

            this.subscription = await this.session.createSubscription2({
                requestedPublishingInterval: 250,
                requestedMaxKeepAliveCount: 50,
                requestedLifetimeCount: 6000,
                maxNotificationsPerPublish: 1000,
                publishingEnabled: true,
                priority: 10,
            });

            this.subscription.on("keepalive", function () {
                console.log("keepalive");
            });

            this.subscription.on("terminated", function () {
                console.log(" TERMINATED ------------------------------>");
            });


            const itemToMonitor = {
                nodeId: nodeIdToMonitor,
                attributeId: AttributeIds.Value,
            };
            const parameters = {
                samplingInterval: 100,
                discardOldest: true,
                queueSize: 100,
            };
            const monitoredItem = await this.subscription.monitor(
                itemToMonitor,
                parameters,
                TimestampsToReturn.Both
            );

            monitoredItem.on("changed", (dataValue) => {
                //console.log(dataValue.value.toString());
                /*io.sockets.emit("message", {
                value: dataValue.value.value,
                timestamp: dataValue.serverTimestamp,
                nodeId: nodeIdToMonitor,
                browseName: "Temperature",
                });*/
            });
        } catch (err) {
            if (err instanceof Error) {
                console.log(err.message);
            }
            process.exit(0);
        }
    }

    async stop() {
        if (this.subscription) await this.subscription.terminate();
        if (this.session) await this.session.close();
        if (this.client) await this.client.disconnect();
    }
}