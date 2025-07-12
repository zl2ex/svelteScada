export type BaseTag<T> = { 
    name: string;
    data: T;
}


type BaseTagServerInit<T> = {
    name: string;
    path: string;
    data: T;
}

export class BaseTagServer<T> 
{
    //private static _allTags: BaseTagServer<any>[] = [];

    name: string;
    path: string;
    data: T;
    enabled: boolean;


    constructor(init: BaseTagServerInit<T>)
    {
        this.name = init.name;
        this.path = init.path;
        this.data = init.data;

        this.enabled = true;
    }


    static pollAllTags() {
        this._allTags.forEach((tag) => {
            tag._onGetData; // not right
        })
    }

    private _onSetData(data: T, oldData : T) {
        console.log("_onSetData", data, oldData);
    }

    private _onGetData() {
        console.log("_onGetData");
    }

    write() {
        // do nothing
    }
/*
    get name() { return this._name }
    get data(): T { return this._data }
    set data(v: T) { this._data = v }
    get enabled() { return this._enabled }
    set enabled(v: boolean) { this._enabled = v }
    */
}

export function isBaseTagServer(tag: any): tag is BaseTagServer<any> {
    return (
        tag.name !== undefined &&
        tag.data !== undefined
    );
}