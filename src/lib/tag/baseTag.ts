export type BaseTag<T> = {
    name: string;
    data: T;
    enabled: boolean;
};


type BaseTag_c_init<T> = {
    name: string;
    data: T;
}

export class BaseTag_c<T> 
{
    private _name: string;
    private _data: T;
    private _enabled: boolean;


    constructor(init: BaseTag_c_init<T>)
    {
        this._name = init.name;
        this._data = init.data;
        this._enabled = true;
    }

    get name() { return this._name }
    get data() { return this._data }
    set data(v: T) { this._data = v }
    get enabled() { return this._enabled }
    set enabled(v: boolean) { this._enabled = v }
}