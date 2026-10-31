export const scriptScopes = {
  element: "scada-element-binding",
  event: "scada-event-script",
  tag: "scada-tag-binding",
} as const;

export type ScriptScope = keyof typeof scriptScopes;

export const scriptScopeIds = new Set<string>(Object.values(scriptScopes));
