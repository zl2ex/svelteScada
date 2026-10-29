export type ScriptValue = string | number | boolean | Array<string | number | boolean>;

export type ScriptElementKind = "html" | "svg" | "base-component" | "user-component";

export type ScriptContainerType = "none" | "absolute" | "flex" | "grid" | "block";

export type ScriptAttributeValue = string | number | boolean;

export type ScriptElementStyle = Record<string, string>;

export type ScriptElementAttributeValue = ScriptAttributeValue;

export type ScriptElementAttributes = Record<string, ScriptElementAttributeValue>;

export type ScriptElementBindings = {
  text?: string;
  attributes?: Record<string, string>;
  style?: Record<string, string>;
  props?: Record<string, string>;
  events?: Record<string, string>;
};

export type ScriptNeverThrowError = {
  reason: string;
  cause: string | ScriptNeverThrowError;
};

export type ScriptWireErr<E> = {
  isErr: true;
  isOk: false;
  error: E;
};

export type ScriptWireOk<T> = {
  isErr: false;
  isOk: true;
  value: T;
};

export type ScriptWireResult<T, E> = ScriptWireErr<E> | ScriptWireOk<T>;

export type ScriptTagStatus = "loading" | "error" | "reconnecting" | "connected" | "missing";

export type ScriptTagOptions = {
  id: string;
  name: string;
  folderId?: string | null;
  dataType?: string;
  type?: "tag" | "udtTag";
  initalValue?: string | null;
  nodeId?: string | null;
  writeable?: boolean | null;
  exposeOverOpcua?: boolean | null;
  parameters?: unknown;
  unit?: string;
  trend?: {
    tagId?: string;
    minimumIntervalMs?: number;
    enabled?: boolean;
  };
};

export type ScriptTagValue = {
  id: string;
  name: string;
  path: string;
  value: ScriptValue;
  statusString: string;
  options: ScriptTagOptions;
};

export type ScriptTagEntry =
  | { status: "loading"; value: null; error: null }
  | { status: "error"; value: null; error: unknown }
  | {
      status: "reconnecting" | "connected";
      value: ScriptWireResult<ScriptTagValue, ScriptNeverThrowError>;
      error: null;
    };

export type ScriptElement = {
  id: string;
  kind: ScriptElementKind;
  tag: string | null;
  baseComponent: string | null;
  referencedComponentId: string | null;
  name: string;
  text: string | null;
  containerType: ScriptContainerType;
  attributes: ScriptElementAttributes;
  style: ScriptElementStyle;
  bindings?: ScriptElementBindings | null;
  sortIndex: number;
  createdAt: number;
  updatedAt: number;
  parentId: string | null;
};

export type ScriptGoto = (
  url: string | URL,
  options?: {
    replaceState?: boolean;
    noScroll?: boolean;
    keepFocus?: boolean;
    invalidateAll?: boolean;
    invalidate?: (string | URL | ((url: URL) => boolean))[];
    state?: any;
  },
) => Promise<void>;

export type ScriptToast = (message: {
  kind: "info" | "success" | "warning" | "error";
  title: string;
  description?: string;
  duration?: number;
}) => unknown;

export type ScriptWriteTag = (
  lookup: string,
  value: ScriptValue,
) => Promise<ScriptWireResult<{ success: true }, ScriptNeverThrowError>>;

export type ScriptBindingGlobals = {
  tag: (lookup: string) => ScriptTagEntry | undefined;
  tagValue: (lookup: string) => ScriptTagValue | undefined;
  tagStatus: (lookup: string) => ScriptTagStatus;
  props: ScriptElementAttributes;
  element: ScriptElement;
};

export type ScriptEventTarget = {
  tagName: string;
  id: string;
  name: string;
  type: string;
  value: string | number | boolean | null;
  checked: boolean | null;
};

export type ScriptEvent = {
  type: string;
  key: string;
  code: string;
  repeat: boolean;
  button: number;
  buttons: number;
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
  screenX: number;
  screenY: number;
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  detail: number;
  pointerType: string;
  isTrusted: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  target: ScriptEventTarget | null;
  currentTarget: ScriptEventTarget | null;
  preventDefault: () => void;
  stopPropagation: () => void;
  stopImmediatePropagation: () => void;
};

export type ScriptEventGlobals = ScriptBindingGlobals & {
  event: ScriptEvent;
  writeTag: ScriptWriteTag;
  goto: ScriptGoto;
  toast: ScriptToast;
};
