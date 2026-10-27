import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import tsWorker from "monaco-editor/languages/features/typescript/ts.worker?worker";
import scriptApiTypes from "$generated/scriptApi.d.ts?raw";

globalThis.MonacoEnvironment = {
  getWorker(_workerId, label) {
    return label === "typescript" || label === "javascript" ? new tsWorker() : new editorWorker();
  },
};

const apiLibPath = "file:///svelte-scada/scriptApi.d.ts";
const tagPathsLibPath = "file:///svelte-scada/scriptTagPaths.d.ts";

let configured = false;
let tagPathsLib: monaco.IDisposable | undefined;
let tagPaths = new Set<string>();

function tagPathsDeclaration(paths: Set<string>) {
  const properties = [...paths]
    .sort()
    .map((path) => `    ${JSON.stringify(path)}: true;`)
    .join("\n");

  return `declare global {\n  interface ScriptTagPaths {\n${properties}\n  }\n}\n\nexport {};`;
}

function applyTagPaths() {
  tagPathsLib?.dispose();
  tagPathsLib = monaco.typescript.javascriptDefaults.addExtraLib(
    tagPathsDeclaration(tagPaths),
    tagPathsLibPath,
  );
}

function registerTagPathCompletions() {
  monaco.languages.registerCompletionItemProvider("javascript", {
    triggerCharacters: ['"', "'", "`"],
    provideCompletionItems(model, position) {
      const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const match = line.match(/(?:tag|tagValue|tagStatus|writeTag)\s*\(\s*["'`]([^"'`]*)$/);

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

  monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  monaco.typescript.javascriptDefaults.setCompilerOptions({
    allowJs: true,
    checkJs: true,
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    lib: ["esnext", "dom", "dom.iterable"],
    strict: true,
    noEmit: true,
    allowNonTsExtensions: true,
  });

  monaco.typescript.javascriptDefaults.addExtraLib(scriptApiTypes, apiLibPath);
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
