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
import { scriptScopeIds, scriptScopes } from "./scriptScopes";

globalThis.MonacoEnvironment = {
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

type DefaultsConstructor = new (
  compilerOptions: monaco.typescript.CompilerOptions,
  diagnosticsOptions: monaco.typescript.DiagnosticsOptions,
  workerOptions: monaco.typescript.WorkerOptions,
  inlayHintsOptions: monaco.typescript.LanguageServiceDefaults["inlayHintsOptions"],
  modeConfiguration: monaco.typescript.ModeConfiguration,
) => monaco.typescript.LanguageServiceDefaults;

function tagPathsDeclaration(paths: Set<string>) {
  const properties = [...paths]
    .sort()
    .map((path) => `    ${JSON.stringify(path)}: true;`)
    .join("\n");

  return `declare global {\n
    interface ScriptTagPaths {\n
    ${properties}\n
      }\n
      }\n
      \n
      export {};`;
}

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

  defaults.addExtraLib(extraLib, apiLibPath);
  return defaults;
}

function registerScopedLanguage(modeId: string) {
  monaco.languages.register({ id: modeId });
  monaco.languages.setLanguageConfiguration(modeId, jsConf);
  monaco.languages.setMonarchTokensProvider(modeId, jsLanguage);
}

function setupScopedMode(modeId: string, defaults: monaco.typescript.LanguageServiceDefaults) {
  const manager = new WorkerManager(modeId, defaults);
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
    monaco.languages.registerDocumentRangeFormattingEditProvider(
      modeId,
      new FormatAdapter(worker),
    );
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

function createScopedLanguage(modeId: string, extraLib: string, shareTagPaths: boolean) {
  registerScopedLanguage(modeId);
  const defaults = createScopedDefaults(extraLib);
  setupScopedMode(modeId, defaults);
  if (shareTagPaths) tagPathDefaults.push(defaults);
}

function applyTagPaths() {
  for (const defaults of tagPathDefaults) {
    defaults.addExtraLib(tagPathsDeclaration(tagPaths), tagPathsLibPath);
  }
}

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

function registerTagPathCompletion(modeId: string, pattern: RegExp) {
  monaco.languages.registerCompletionItemProvider(modeId, {
    triggerCharacters: ['"', "'", "`"],
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

export function configureMonaco() {
  if (configured) return;
  configured = true;

  createScopedLanguage(scriptScopes.element, elementBindingTypes, true);
  createScopedLanguage(scriptScopes.event, eventBindingTypes, true);
  createScopedLanguage(scriptScopes.tag, tagBindingTypes, false);

  applyTagPaths();
  registerTagPathCompletions();
}

export function updateScriptTagPaths(paths: Iterable<string>) {
  const next = new Set(paths);

  if (next.size === tagPaths.size && [...next].every((path) => tagPaths.has(path))) {
    return;
  }

  tagPaths = next;

  if (configured) applyTagPaths();
}

export { monaco };
