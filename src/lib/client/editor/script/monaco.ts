import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import tsWorker from "monaco-editor/languages/features/typescript/ts.worker?worker";
import cssWorker from "monaco-editor/languages/features/css/css.worker?worker";
import {
  conf as jsConf,
  language as jsLanguage,
} from "monaco-editor/languages/definitions/javascript/javascript.js";
import {
  CodeActionAdaptor,
  DefinitionAdapter,
  DiagnosticsAdapter,
  DocumentHighlightAdapter,
  FormatAdapter,
  FormatOnTypeAdapter,
  InlayHintsAdapter,
  LibFiles,
  OutlineAdapter,
  QuickInfoAdapter,
  ReferenceAdapter,
  RenameAdapter,
  SignatureHelpAdapter,
  SuggestAdapter,
  WorkerManager,
} from "monaco-editor/languages/features/typescript/tsMode.js";
import elementBindingTypes from "$generated/scriptElementBindings.d.ts?raw";
import eventBindingTypes from "$generated/scriptEventBindings.d.ts?raw";
import tagBindingTypes from "$generated/scriptTagBindings.d.ts?raw";
import { scriptScopeIds, scriptScopes, type ScriptScope } from "./scriptScopes";
import type { ScriptPropertyKeyInfo } from "$lib/client/editor/propertyKeys";

globalThis.MonacoEnvironment = {
  /**
   * Selects the Monaco web worker for a language label.
   *
   * @param _workerId - Worker identifier supplied by Monaco (unused)
   * @param label - Language label requesting a worker
   * @returns The worker instance for the label
   */
  getWorker(_workerId, label) {
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    return label === "typescript" || label === "javascript" || scriptScopeIds.has(label)
      ? new tsWorker()
      : new editorWorker();
  },
};

const apiLibPath = "file:///svelte-scada/scriptApi.d.ts";
const tagPathsLibPath = "file:///svelte-scada/scriptTagPaths.d.ts";

let configured = false;
let tagPaths = new Set<string>();
const tagPathDefaults: monaco.typescript.LanguageServiceDefaults[] = [];
const scopeDefaults = new Map<ScriptScope, monaco.typescript.LanguageServiceDefaults>();
const scopeTypeSources = new Map<ScriptScope, string>();
const scopeTypeLibs = new Map<ScriptScope, monaco.IDisposable>();
const propertyKeySignatures = new Map<ScriptScope, string>();

type DefaultsConstructor = new (
  compilerOptions: monaco.typescript.CompilerOptions,
  diagnosticsOptions: monaco.typescript.DiagnosticsOptions,
  workerOptions: monaco.typescript.WorkerOptions,
  inlayHintsOptions: monaco.typescript.LanguageServiceDefaults["inlayHintsOptions"],
  modeConfiguration: monaco.typescript.ModeConfiguration,
) => monaco.typescript.LanguageServiceDefaults;

/**
 * Builds the ambient declaration that lists valid script tag paths.
 *
 * @param paths - Tag paths to declare
 * @returns TypeScript declaration source
 */
function tagPathsDeclaration(paths: Set<string>) {
  const properties = [...paths]
    .sort()
    .map((path) => `    ${JSON.stringify(path)}: true;`)
    .join("\n");

  return `declare global {\n
    /** Known tag paths available to tag(), tagValue(), and tagStatus(). */\n
    interface ScriptTagPaths {\n
    ${properties}\n
      }\n
      }\n
      \n
      export {};`;
}

/**
 * Creates a TypeScript language-service defaults instance for a scoped mode.
 *
 * @param extraLib - Ambient declaration source exposed to the mode
 * @returns Configured language-service defaults
 */
function createScopedDefaults(extraLib: string) {
  const Defaults = monaco.typescript.javascriptDefaults.constructor as DefaultsConstructor;
  const defaults = new Defaults(
    {
      allowJs: true,
      checkJs: true,
      target: monaco.typescript.ScriptTarget.ESNext,
      module: monaco.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
      lib: ["esnext"],
      strict: true,
      noEmit: true,
      allowNonTsExtensions: true,
      skipLibCheck: true,
    },
    {
      noSemanticValidation: false,
      noSyntaxValidation: false,
    },
    {},
    {},
    monaco.typescript.javascriptDefaults.modeConfiguration,
  );

  const lib = defaults.addExtraLib(extraLib, apiLibPath);
  return { defaults, lib };
}

/**
 * Registers a scoped language using the JavaScript tokenizer and configuration.
 *
 * @param modeId - Language identifier to register
 */
function registerScopedLanguage(modeId: string) {
  monaco.languages.register({ id: modeId });
  monaco.languages.setLanguageConfiguration(modeId, jsConf);
  monaco.languages.setMonarchTokensProvider(modeId, jsLanguage);
}

/**
 * Wires a scoped language's editors to a TypeScript language-service worker.
 *
 * @param modeId - Language identifier to set up
 * @param defaults - Language-service defaults backing the mode
 */
function setupScopedMode(modeId: string, defaults: monaco.typescript.LanguageServiceDefaults) {
  const manager = new WorkerManager(modeId, defaults);
  /**
   * Requests the language-service worker for one or more URIs.
   *
   * @param uris - Documents the worker should track
   * @returns Promise resolving to the language-service worker
   */
  const worker = (...uris: monaco.Uri[]) => manager.getLanguageServiceWorker(...uris);
  const libFiles = new LibFiles(worker);
  const modeConfiguration = defaults.modeConfiguration;

  if (modeConfiguration.completionItems) {
    monaco.languages.registerCompletionItemProvider(modeId, new SuggestAdapter(worker));
  }
  if (modeConfiguration.signatureHelp) {
    monaco.languages.registerSignatureHelpProvider(modeId, new SignatureHelpAdapter(worker));
  }
  if (modeConfiguration.hovers) {
    monaco.languages.registerHoverProvider(modeId, new QuickInfoAdapter(worker));
  }
  if (modeConfiguration.documentHighlights) {
    monaco.languages.registerDocumentHighlightProvider(
      modeId,
      new DocumentHighlightAdapter(worker),
    );
  }
  if (modeConfiguration.definitions) {
    monaco.languages.registerDefinitionProvider(modeId, new DefinitionAdapter(libFiles, worker));
  }
  if (modeConfiguration.references) {
    monaco.languages.registerReferenceProvider(modeId, new ReferenceAdapter(libFiles, worker));
  }
  if (modeConfiguration.documentSymbols) {
    monaco.languages.registerDocumentSymbolProvider(modeId, new OutlineAdapter(worker));
  }
  if (modeConfiguration.rename) {
    monaco.languages.registerRenameProvider(modeId, new RenameAdapter(libFiles, worker));
  }
  if (modeConfiguration.documentRangeFormattingEdits) {
    monaco.languages.registerDocumentRangeFormattingEditProvider(modeId, new FormatAdapter(worker));
  }
  if (modeConfiguration.onTypeFormattingEdits) {
    monaco.languages.registerOnTypeFormattingEditProvider(modeId, new FormatOnTypeAdapter(worker));
  }
  if (modeConfiguration.codeActions) {
    monaco.languages.registerCodeActionProvider(modeId, new CodeActionAdaptor(worker));
  }
  if (modeConfiguration.inlayHints) {
    monaco.languages.registerInlayHintsProvider(modeId, new InlayHintsAdapter(worker));
  }
  if (modeConfiguration.diagnostics) {
    new DiagnosticsAdapter(libFiles, defaults, modeId, worker);
  }
}

/**
 * Registers a scoped language and optionally shares tag-path declarations with it.
 *
 * @param modeId - Language identifier to create
 * @param extraLib - Ambient declaration source exposed to the mode
 * @param shareTagPaths - Whether the mode should receive tag-path completions
 */
function createScopedLanguage(scope: ScriptScope, extraLib: string, shareTagPaths: boolean) {
  const modeId = scriptScopes[scope];
  registerScopedLanguage(modeId);
  const { defaults, lib } = createScopedDefaults(extraLib);
  scopeDefaults.set(scope, defaults);
  scopeTypeSources.set(scope, extraLib);
  scopeTypeLibs.set(scope, lib);
  setupScopedMode(modeId, defaults);
  if (shareTagPaths) tagPathDefaults.push(defaults);
}

/**
 * Pushes the current tag-path declarations into every sharing language service.
 */
function applyTagPaths() {
  for (const defaults of tagPathDefaults) {
    defaults.addExtraLib(tagPathsDeclaration(tagPaths), tagPathsLibPath);
  }
}

/**
 * Registers tag-path completion providers for the element and event script scopes.
 */
function registerTagPathCompletions() {
  registerTagPathCompletion(
    scriptScopes.element,
    /(?:tag|tagValue|tagStatus)\s*\(\s*["'`]([^"'`]*)$/,
  );
  registerTagPathCompletion(
    scriptScopes.event,
    /(?:tag|tagValue|tagStatus|writeTag)\s*\(\s*["'`]([^"'`]*)$/,
  );
}

/**
 * Registers a tag-path completion provider for a language mode.
 *
 * @param modeId - Language identifier to attach the provider to
 * @param pattern - Regex matching an unfinished tag lookup before the cursor
 */
function registerTagPathCompletion(modeId: string, pattern: RegExp) {
  monaco.languages.registerCompletionItemProvider(modeId, {
    triggerCharacters: ['"', "'", "`"],
    /**
     * Suggests known tag paths for the lookup being typed.
     *
     * @param model - Editor model containing the cursor
     * @param position - Current cursor position
     * @returns Completion suggestions for the model
     */
    provideCompletionItems(model, position) {
      const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const match = line.match(pattern);

      if (!match) return { suggestions: [] };

      const startColumn = position.column - match[1].length;
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn,
        endColumn: position.column,
      };

      return {
        suggestions: [...tagPaths].map((path) => ({
          label: path,
          kind: monaco.languages.CompletionItemKind.Value,
          insertText: path,
          range,
        })),
      };
    },
  });
}

/**
 * Configures Monaco's script modes once per session.
 */
export function configureMonaco() {
  if (configured) return;
  configured = true;

  createScopedLanguage("element", elementBindingTypes, true);
  createScopedLanguage("event", eventBindingTypes, true);
  createScopedLanguage("tag", tagBindingTypes, false);

  applyTagPaths();
  registerTagPathCompletions();
}

/**
 * Builds the JSDoc block for a generated property key.
 *
 * @param description - Optional property description
 * @returns JSDoc source lines, or an empty string when there is no description
 */
function propertyKeyDoc(description?: string) {
  if (!description) return "";
  const lines = description
    .split(/\r?\n/)
    .map((line) => `     * ${line.replace(/\*\//g, "* /")}`)
    .join("\n");
  return `    /**\n${lines}\n     */\n`;
}

/**
 * Replaces a scope's open property record with the keys valid for the editor context.
 *
 * @param source - Base script type declaration source
 * @param alias - Property type alias to narrow
 * @param keys - Property keys available in the current editor context
 * @returns Declaration source with the narrowed property type and per-key JSDoc
 */
function withPropertyKeys(source: string, alias: string, keys: ScriptPropertyKeyInfo[]) {
  const interfaceName =
    alias === "ScriptTagProperties" ? "ScriptTagPropertyKeys" : "ScriptElementPropertyKeys";
  const members = keys
    .map((entry) => `${propertyKeyDoc(entry.description)}    ${JSON.stringify(entry.key)}: true;`)
    .join("\n");
  const interfaceDeclaration = `declare global {\n  interface ${interfaceName} {\n${members}\n  }\n}\n`;
  const replacement = `export type ${alias} = Partial<Record<keyof ${interfaceName}, ScriptPropertyValue>>;`;
  const pattern = new RegExp(`^export type ${alias} = Record<string, ScriptPropertyValue>;$`, "m");
  return `${source.replace(pattern, replacement)}\n${interfaceDeclaration}`;
}

/**
 * Updates the property keys injected into a scoped script language service.
 *
 * @param scope - Script scope being edited
 * @param entries - Property keys and descriptions valid for the current tag or element
 */
export function updateScriptPropertyKeys(
  scope: ScriptScope,
  entries: Iterable<ScriptPropertyKeyInfo | string>,
) {
  const defaults = scopeDefaults.get(scope);
  const source = scopeTypeSources.get(scope);
  if (!defaults || !source) return;

  const normalized = new Map<string, ScriptPropertyKeyInfo>();
  for (const entry of entries) {
    const info = typeof entry === "string" ? { key: entry } : entry;
    if (!info.key) continue;
    const description = info.description?.trim();
    const existing = normalized.get(info.key);
    if (!existing) normalized.set(info.key, { key: info.key, description: description || undefined });
    else if (!existing.description && description) existing.description = description;
  }

  const next = [...normalized.values()].sort((a, b) => a.key.localeCompare(b.key));
  const signature = JSON.stringify(next);
  if (propertyKeySignatures.get(scope) === signature) return;

  propertyKeySignatures.set(scope, signature);
  scopeTypeLibs.get(scope)?.dispose();

  const alias = scope === "tag" ? "ScriptTagProperties" : "ScriptElementProperties";
  scopeTypeLibs.set(scope, defaults.addExtraLib(withPropertyKeys(source, alias, next), apiLibPath));
}

/**
 * Replaces the known tag paths and refreshes completions when configured.
 *
 * @param paths - Current tag paths to expose to scripts
 */
export function updateScriptTagPaths(paths: Iterable<string>) {
  const next = new Set(paths);

  if (next.size === tagPaths.size && [...next].every((path) => tagPaths.has(path))) {
    return;
  }

  tagPaths = next;

  if (configured) applyTagPaths();
}

export { monaco };
