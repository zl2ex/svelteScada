import type {
  ResolveType,
  TagOptionsInput,
  TagPaths,
} from "$lib/server/tag/tag";
import type { Result } from "$lib/util/attempt";

export type ClientDataTypeStrings = "number" | "boolean" | "string" | "any";

//export class ClientTag<DataTypeString extends BaseTypeStringsWithArrays> {
export class ClientTag<DataTypeString extends ClientDataTypeStrings> {
  private _value: ResolveType<DataTypeString>;
  private expectedDataType: ClientDataTypeStrings;
  path: TagPaths;
  options: TagOptionsInput<any>;
  statusCodeString: string;
  children?: Map<string, ClientTag<any>>;
  errorMessage?: string;

  constructor(expectedDataType: DataTypeString, opts: ClientTagOptions) {
    this.path = opts.path;
    this.expectedDataType = expectedDataType;
    this.options = $state({
      name: opts.name ?? "",
      parentPath: opts.parentPath ?? "/",
      dataType: expectedDataType,
      writeable: false,
      parameters: undefined,
      overrides: undefined,
      exposeOverOpcua: false,
    });

    this._value = $state(opts.initialValue ?? null);
    this.statusCodeString = $state("UncertainInitalValue");
    this.errorMessage = $state(undefined);
    this.children = $state(new Map());

    //ClientTag.tags[this.path] = this;

    ClientTag.events.addEventListener(`tag:update:${this.path}`, this.update);

    console.log(`[ClientTag] created tag ${this.path}`);
  }

  [Symbol.dispose]() {
    this.dispose();
  }

  dispose() {
    this.unsubscribe();
    console.trace(`[ClientTag] dispose() ${this.path}`);
    //delete ClientTag.tags[this.path];
  }

  private update = (e: CustomEvent<EmitPayload>) => {
    const path = e.detail.path;
    const payload = e.detail.value;

    if (path != this.path)
      throw new Error(
        `[Client Tag]  tag:update  path ${path} does not match requested path ${this.path}`,
      );

    // TD WIP Validate datatype of tag vs datatype of clientTag
    /*if (this.expectedDataType !== payload.dataType)
      throw new Error(
        `[Client Tag] tag:update   dataType ${payload.dataType} is not assignable to ${this.expectedDataType}`
      );
*/
    this.options = payload.options;
    this._value = payload.value;
    this.statusCodeString = payload.statusCodeString;
    this.errorMessage = payload.errorMessage;
    if (payload.childTags) {
      payload.childTags.forEach((child) => {
        this.children?.set(child.path, new ClientTag("any", child));
      });
    }
  };

  get value() {
    return this._value;
  }

  set value(newValue: any) {
    this.write(newValue);
  }

  async write(value: ResolveType<DataTypeString>) {
    if (!ClientTag.socket) {
      throw new Error(
        `[ClientTag] Socket.io client not initalised  Call initSocketIo() before calling write()`,
      );
    }

    // only update on change
    if (value == this._value) return;

    return new Promise((resolve, reject) => {
      ClientTag.socket?.emit(
        "tag:write",
        { path: this.path, value },
        (response) => {
          if ("error" in response) {
            console.error(response.error.message);
            this.errorMessage = response.error.message;
            reject({ data: undefined, error: response.error });
          } else {
            // populate the tag with all the data returned
            this.update({ detail: response.data });
            this.errorMessage = undefined;
            resolve({ data: this, error: undefined });
          }
        },
      );
    });
  }

  async subscribe(): Promise<Result<ClientTag<any>, Error>> {
    if (!ClientTag.socket) {
      throw new Error(
        `[ClientTag] Socket.io client not initalised  Call initSocketIo() before calling subscribe()`,
      );
    }
    //ClientTag.socket.emit("tag:subscribe", this.path);
    //console.debug(`[ClientTag] attempt to subscribe tag ${this.path}`);

    return new Promise((resolve, reject) => {
      ClientTag.socket?.emit("tag:subscribe", this.path, (response) => {
        if ("error" in response) {
          console.error(response.error.message);
          this.errorMessage = response.error.message;
          reject({ data: undefined, error: response.error });
        } else {
          // populate the tag with all the data returned
          this.update({ detail: response.data });
          resolve({ data: this, error: undefined });
        }
      });
    });
  }

  unsubscribe() {
    if (!ClientTag.socket) {
      throw new Error(
        `[ClientTag] Socket.io client not initalised  Call initSocketIo() before calling unsubscribe()`,
      );
    }
    ClientTag.socket.emit("tag:unsubscribe", this.path);
    console.log(`[ClientTag] un-subscribe tag ${this.path}`);
  }
}
