import type {
  BindingContext,
  EventContext,
  GotoFn,
  ToastFn,
} from "$lib/client/editor/elementExpressions";
import type { TagValue } from "$lib/server/tag/tag";
import type {
  ContainerType,
  ElementAttributes,
  ElementBindings,
  ElementKind,
} from "$lib/page/elementTypes";
import type { NeverThrowError, WireResult } from "$lib/util/neverThrow";
import type {
  ScriptBindingGlobals,
  ScriptContainerType,
  ScriptElementAttributes,
  ScriptElementBindings,
  ScriptElementKind,
  ScriptEventGlobals,
  ScriptNeverThrowError,
  ScriptValue,
  ScriptWireResult,
} from "$lib/client/editor/script/scriptApi";

type AssertAssignable<T extends U, U> = T;

export type _TagValueToScriptValue = AssertAssignable<TagValue, ScriptValue>;
export type _ScriptValueToTagValue = AssertAssignable<ScriptValue, TagValue>;
export type _ElementAttributesToScriptAttributes = AssertAssignable<
  ElementAttributes,
  ScriptElementAttributes
>;
export type _ScriptAttributesToElementAttributes = AssertAssignable<
  ScriptElementAttributes,
  ElementAttributes
>;
export type _ElementBindingsToScriptBindings = AssertAssignable<
  ElementBindings,
  ScriptElementBindings
>;
export type _ScriptBindingsToElementBindings = AssertAssignable<
  ScriptElementBindings,
  ElementBindings
>;
export type _ElementKindToScriptKind = AssertAssignable<ElementKind, ScriptElementKind>;
export type _ScriptKindToElementKind = AssertAssignable<ScriptElementKind, ElementKind>;
export type _ContainerTypeToScriptContainerType = AssertAssignable<
  ContainerType,
  ScriptContainerType
>;
export type _ScriptContainerTypeToContainerType = AssertAssignable<
  ScriptContainerType,
  ContainerType
>;
export type _NeverThrowErrorToScriptNeverThrowError = AssertAssignable<
  NeverThrowError,
  ScriptNeverThrowError
>;
export type _ScriptNeverThrowErrorToNeverThrowError = AssertAssignable<
  ScriptNeverThrowError,
  NeverThrowError
>;
export type _WireResultToScriptWireResult<T, E> = AssertAssignable<
  WireResult<T, E>,
  ScriptWireResult<T, E>
>;
export type _ScriptWireResultToWireResult<T, E> = AssertAssignable<
  ScriptWireResult<T, E>,
  WireResult<T, E>
>;
export type _BindingContextConforms = AssertAssignable<BindingContext, ScriptBindingGlobals>;
export type _EventContextConforms = AssertAssignable<
  EventContext & { goto: GotoFn; toast: ToastFn },
  ScriptEventGlobals
>;
