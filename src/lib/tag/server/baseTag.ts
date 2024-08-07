type BaseTagServerInit<T> = {
    name: string;
    path: string;
    data: T;
}

export class BaseTagServer<T> 
{
    private _name: string;
    private _path: string;
    private _data: T;
    private _enabled: boolean;


    constructor(init: BaseTagServerInit<T>)
    {
        this._name = init.name;
        this._path = init.path;
        this._data = init.data;

        this._enabled = true;
    }

    private _onSetData(data: T, oldData : T) {
        console.log("_onSetData", data, oldData);
    }

    private _onGetData() {
        console.log("_onGetData");
    }

    get name() { return this._name }
    get data(): T { return this._data }
    set data(v: T) { this._data = v }
    get enabled() { return this._enabled }
    set enabled(v: boolean) { this._enabled = v }
}