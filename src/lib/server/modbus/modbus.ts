import Modbus, { ModbusTCPClient } from 'jsmodbus';
import net from 'net';

type ModbusTcpDeviceOptions = {
    ipAddress: string;
    slaveId?: number;
    port?: number;
};

export class ModbusTcpDevice {
    private _socket = new net.Socket();
    private _client : ModbusTCPClient;

    constructor(options: ModbusTcpDeviceOptions) {
        this._client = new Modbus.client.TCP(this._socket, options?.slaveId || 1);

        this._socket.on('connect', () => {

            this._client.readHoldingRegisters(0, 13).then( (resp) => {
            
            // resp will look like { response : [TCP|RTU]Response, request: [TCP|RTU]Request }
            // the data will be located in resp.response.body.coils: <Array>, resp.response.body.payload: <Buffer>
            
            console.log(resp);
            
        }, console.error);
    
        });

        this._socket.connect({
            host: options.ipAddress,
            port: options?.port || 502
        })
    }
}