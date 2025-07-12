
import { type UAVariable, DataType, Variant, type Namespace, StatusCodes } from "node-opcua";

export type TagOptions = {
  name: string;
  nodeId: string;
  dataType: DataType;
  initialValue?: any;
  onUpdate?: (value: any) => void;
  emit?: (event: string, payload: any) => void;
};

export class Tag {
  name: string;
  nodeId: string;
  dataType: DataType;
  value: any;
  variable?: UAVariable;
  onUpdate?: (value: any) => void;
  emit?: (event: string, payload: any) => void;

  constructor(opts: TagOptions) {
    this.name = opts.name;
    this.nodeId = opts.nodeId ?? `ns=1;s=${opts.name}`;
    this.dataType = opts.dataType;
    this.value = opts.initialValue ?? null;
    this.onUpdate = opts.onUpdate;
    this.emit = opts.emit;
  }

  init(namespace: Namespace, parent: any) {
    this.variable = namespace.addVariable({
      componentOf: parent,
      browseName: this.name,
      nodeId: this.nodeId,
      dataType: this.dataType,
      value: {
        get: () => new Variant({ dataType: this.dataType, value: this.value }),
        set: (variant) => {
          this.value = variant.value;
          this._triggerUpdate();
          return { statusCode: StatusCodes.Good };
        }
      }
    });

    this.variable.on("value_changed", (dataValue) => {
      this.value = dataValue.value.value;
      this._triggerUpdate();
    });
  }

  update(newValue: any) {
    this.value = newValue;
    this.variable?.setValueFromSource({
      dataType: this.dataType,
      value: newValue
    });
    this._triggerUpdate();
  }

  private _triggerUpdate() {
    this.onUpdate?.(this.value);
    this.emit?.("tag:update", { nodeId: this.nodeId, value: this.value });
  }
}
