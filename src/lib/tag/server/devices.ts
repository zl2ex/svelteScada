import { ModbusTcpDevice } from "../../server/drivers/modbus/modbusTcp";

export let Devices = {
    DemoPLC: new ModbusTcpDevice({
        ipAddress: "127.0.0.1"
    })
}