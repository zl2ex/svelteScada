import { ModbusTcpDevice } from "../../server/modbus/modbus";

export let Devices = {
    DemoPLC: new ModbusTcpDevice({
        ipAddress: "127.0.0.1"
    })
}