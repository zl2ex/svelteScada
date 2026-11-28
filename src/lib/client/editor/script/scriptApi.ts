/** A plain value that can be produced or consumed by scripts. */
export type ScriptValue =
  string | number | boolean | ScriptValue[] | { [key: string]: ScriptValue };

/** The kind of element being edited. */
export type ScriptElementKind = "html" | "svg" | "base-component" | "user-component";

/** A primitive HTML, SVG, or component attribute value. */
export type ScriptAttributeValue = string | number | boolean;

/** A property value with optional metadata used by property editors. */
export type ScriptPropertyValue = {
  /** Current property value. */
  value: ScriptAttributeValue;
  /** Tooltip shown in property editors. */
  description?: string;
  /** Whether the property is required in the editor. */
  required?: boolean;
};

/** A map of arbitrary property names to script property values. */
export type ScriptProperties = Record<string, ScriptPropertyValue>;

/** Properties of the tag currently being edited; keys are generated for autocomplete. */
export type ScriptTagProperties = Record<string, ScriptPropertyValue>;

/** Properties of the element currently being edited; keys are generated for autocomplete. */
export type ScriptElementProperties = Record<string, ScriptPropertyValue>;

/** CSS style declarations keyed by CSS property name. */
export type ScriptElementStyle = Record<string, string>;

/** A primitive attribute value for an element. */
export type ScriptElementAttributeValue = ScriptAttributeValue;

/** Attribute values keyed by attribute name. */
export type ScriptElementAttributes = Record<string, ScriptElementAttributeValue>;

/** Makes every binding scope optional. */
export type ScriptBindings<T> = Partial<T>;

/** Binding expressions stored on an element, keyed by binding scope. */
export type ScriptElementBindings = ScriptBindings<{
  /** Text binding expression. */
  text: string;
  /** Attribute binding expressions keyed by attribute name. */
  attributes: Record<string, string>;
  /** Style binding expressions keyed by CSS property name. */
  style: Record<string, string>;
  /** Property binding expressions keyed by property name. */
  properties: Record<string, string>;
  /** Event scripts keyed by event name. */
  events: Record<string, string>;
  /** Style class binding expressions keyed by class name. */
  styleClass: Record<string, string>;
}>;

/** Binding expressions stored on a tag, keyed by tag field. */
export type ScriptTagBindings = ScriptBindings<{
  /** Driver path binding. */
  driverPath: string;
  /** Data type binding. */
  dataType: string;
  /** Initial value binding. */
  initalValue: string;
  /** Read-only flag binding. */
  readonly: string;
  /** OPC UA exposure flag binding. */
  exposeOverOpcua: string;
  /** Properties object binding. */
  properties: string;
  /** Unit binding. */
  unit: string;
  /** Trend enabled flag binding. */
  trendEnabled: string;
  /** Minimum trend sampling interval binding. */
  trendMinimumSamplingIntervalMs: string;
  /** Write level binding. */
  writeLevel: string;
}>;

/** A neverthrow-style error carrying a reason and a cause. */
export type ScriptNeverThrowError = {
  /** Machine-readable error reason. */
  reason: string;
  /** Human-readable cause or a nested error. */
  cause: string | ScriptNeverThrowError;
};

/** A failed wire result. */
export type ScriptWireErr<E> = {
  isErr: true;
  isOk: false;
  /** Error payload. */
  error: E;
};

/** A successful wire result. */
export type ScriptWireOk<T> = {
  isErr: false;
  isOk: true;
  /** Success payload. */
  value: T;
};

/** A result sent across the live wire. */
export type ScriptWireResult<T, E> = ScriptWireErr<E> | ScriptWireOk<T>;

/** Live status of a tag lookup. */
export type ScriptTagStatus = "loading" | "error" | "reconnecting" | "connected" | "missing";

/** Tag configuration exposed as `tagConfig` in tag binding scripts. */
export type ScriptTagOptions = {
  /** Tag id. */
  id: string;
  /** Tag name. */
  name: string;
  /** Folder id, or null for root tags. */
  folderId?: string | null;
  /** Data type name, usually a base type or UDT name. */
  dataType?: string;
  /** Initial value. */
  initalValue?: string | null;
  /** Driver path used to read and write the tag. */
  driverPath?: string | null;
  /** Whether the tag rejects writes. */
  readonly?: boolean | null;
  /** Whether the tag is exposed over OPC UA. */
  exposeOverOpcua?: boolean | null;
  /** Custom tag properties. */
  properties?: ScriptProperties | null;
  /** Engineering unit. */
  unit?: string;
  /** Minimum permission required to write the tag. */
  writeLevel?: "operator" | "engineer" | "admin";
  /** Field binding expressions. */
  bindings?: ScriptTagBindings | null;
  /** Whether trend history is recorded. */
  trendEnabled?: boolean;
  /** Minimum interval between recorded trend samples, in milliseconds. */
  trendMinimumSamplingIntervalMs?: number;
};

/** The current tag's configuration, with generated property keys for autocomplete. */
export type ScriptCurrentTagConfig = Omit<ScriptTagOptions, "properties"> & {
  /** Effective tag properties with generated keys for autocomplete. */
  properties?: ScriptTagProperties | null;
};

/** A resolved tag value exposed by `tagValue()`. */
export type ScriptTagValue = {
  /** Tag id. */
  id: string;
  /** Tag name. */
  name: string;
  /** Full tag path. */
  path: string;
  /** Current value. */
  value: ScriptValue;
  /** Human-readable status string. */
  statusString: string;
  /** Tag configuration. */
  options: ScriptTagOptions;
};

/** The state of a tag lookup. */
export type ScriptTagEntry =
  | {
      /** The tag value is still loading. */
      status: "loading";
      value: null;
      error: null;
    }
  | {
      /** The tag lookup failed. */
      status: "error";
      value: null;
      /** Failure details. */
      error: unknown;
    }
  | {
      /** The tag is connected or reconnecting. */
      status: "reconnecting" | "connected";
      /** The resolved tag value or a failed result. */
      value: ScriptWireResult<ScriptTagValue, ScriptNeverThrowError>;
      error: null;
    };

/** An element record exposed to element and event binding scripts. */
export type ScriptElement = {
  /** Element id. */
  id: string;
  /** Element kind. */
  kind: ScriptElementKind;
  /** HTML or SVG tag name. */
  tag: string | null;
  /** Base component name for base-component elements. */
  baseComponent: string | null;
  /** Referenced user-component definition id. */
  referencedComponentId: string | null;
  /** Display name. */
  name: string;
  /** Text content. */
  text: string | null;
  /** Current attributes. */
  attributes: ScriptElementAttributes;
  /** Custom properties. */
  properties?: ScriptProperties;
  /** Inline styles. */
  style: ScriptElementStyle;
  /** Applied style classes. */
  styleClass: string[];
  /** Binding expressions stored on the element. */
  bindings?: ScriptElementBindings | null;
  /** Sort index among siblings. */
  sortIndex: number;
  /** Creation timestamp. */
  createdAt: number;
  /** Last update timestamp. */
  updatedAt: number;
  /** Parent element id, or null for a root element. */
  parentId: string | null;
};

/** The current element, with generated property keys for autocomplete. */
export type ScriptCurrentElement = Omit<ScriptElement, "properties"> & {
  /** Effective element properties with generated keys for autocomplete. */
  properties?: ScriptElementProperties;
};

/** Navigates to a URL. */
export type ScriptGoto = (
  url: string | URL,
  options?: {
    /** Replace the current history entry instead of pushing a new one. */
    replaceState?: boolean;
    /** Prevent scrolling to the top after navigation. */
    noScroll?: boolean;
    /** Keep focus on the current element. */
    keepFocus?: boolean;
    /** Invalidate all load functions. */
    invalidateAll?: boolean;
    /** Specific URLs or functions to invalidate. */
    invalidate?: (string | URL | ((url: URL) => boolean))[];
    /** History state to store with the navigation. */
    state?: any;
  },
) => Promise<void>;

/** Shows a toast notification. */
export type ScriptToast = (message: {
  /** Toast severity. */
  kind: "info" | "success" | "warning" | "error";
  /** Toast title. */
  title: string;
  /** Optional body text. */
  description?: string;
  /** Display duration in milliseconds. */
  duration?: number;
}) => unknown;

/** Writes a value to a tag. */
export type ScriptWriteTag = (
  lookup: string,
  value: ScriptValue,
) => Promise<ScriptWireResult<{ success: true }, ScriptNeverThrowError>>;

/** Tag readers available to element and event scripts. */
export type ScriptCommonBindingGlobals = {
  /** Looks up a tag by id or full path. */
  tag: (lookup: string) => ScriptTagEntry | undefined;
  /** Returns a resolved tag value by id or full path. */
  tagValue: (lookup: string) => ScriptTagValue | undefined;
  /** Returns a tag's live status by id or full path. */
  tagStatus: (lookup: string) => ScriptTagStatus;
};

/** Looks up an element by id. */
export type ScriptElementLookup = (id: string | null | undefined) => ScriptElement | undefined;

/** Globals available to element binding scripts. */
export type ScriptBindingGlobals = ScriptCommonBindingGlobals & {
  /** The element currently being edited. */
  element: ScriptCurrentElement;
  /** Looks up another element by id. */
  getElementById: ScriptElementLookup;
};

/** Globals available to tag binding scripts. */
export type ScriptTagBindingGlobals = {
  /** The tag currently being edited. */
  tagConfig: ScriptCurrentTagConfig;
  /** The tag's effective properties. */
  properties: ScriptTagProperties;
};

/** A snapshot of an event target. */
export type ScriptEventTarget = {
  /** Target tag name. */
  tagName: string;
  /** Target id. */
  id: string;
  /** Target name. */
  name: string;
  /** Input type when the target is an input. */
  type: string;
  /** Input value when the target is an input. */
  value: string | number | boolean | null;
  /** Checked state when the target is a checkbox or radio. */
  checked: boolean | null;
};

/** A serialized DOM event exposed to event scripts. */
export type ScriptEvent = {
  /** Event type, e.g. `"click"`. */
  type: string;
  /** Keyboard key name. */
  key: string;
  /** Keyboard physical key code. */
  code: string;
  /** Whether the key event is repeating. */
  repeat: boolean;
  /** Mouse button number. */
  button: number;
  /** Pressed mouse buttons bitmask. */
  buttons: number;
  /** Pointer X relative to the viewport. */
  clientX: number;
  /** Pointer Y relative to the viewport. */
  clientY: number;
  /** Pointer X relative to the page. */
  pageX: number;
  /** Pointer Y relative to the page. */
  pageY: number;
  /** Pointer X relative to the screen. */
  screenX: number;
  /** Pointer Y relative to the screen. */
  screenY: number;
  /** Wheel delta X. */
  deltaX: number;
  /** Wheel delta Y. */
  deltaY: number;
  /** Wheel delta mode. */
  deltaMode: number;
  /** Event detail value. */
  detail: number;
  /** Pointer device type. */
  pointerType: string;
  /** Whether the event was generated by the browser. */
  isTrusted: boolean;
  /** Whether Alt was held. */
  altKey: boolean;
  /** Whether Control was held. */
  ctrlKey: boolean;
  /** Whether Shift was held. */
  shiftKey: boolean;
  /** Whether Meta was held. */
  metaKey: boolean;
  /** Event target snapshot. */
  target: ScriptEventTarget | null;
  /** Current target snapshot. */
  currentTarget: ScriptEventTarget | null;
  /** Prevents the default browser action. */
  preventDefault: () => void;
  /** Stops propagation to other listeners. */
  stopPropagation: () => void;
  /** Stops propagation and prevents other listeners on the same target. */
  stopImmediatePropagation: () => void;
};

/** Globals available to event scripts. */
export type ScriptEventGlobals = ScriptBindingGlobals & {
  /** The DOM event that triggered the script. */
  event: ScriptEvent;
  /** Writes a value to a tag. */
  writeTag: ScriptWriteTag;
  /** Navigates to a URL. */
  goto: ScriptGoto;
  /** Shows a toast notification. */
  toast: ScriptToast;
};
