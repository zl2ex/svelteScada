declare module "monaco-editor/languages/definitions/javascript/javascript.js" {
  import type * as Monaco from "monaco-editor";

  export const conf: Monaco.languages.LanguageConfiguration;
  export const language: Monaco.languages.IMonarchLanguage;
}

declare module "monaco-editor/languages/features/typescript/tsMode.js" {
  import type * as Monaco from "monaco-editor";

  type WorkerAccessor = (...uris: Monaco.Uri[]) => Promise<Monaco.typescript.TypeScriptWorker>;

  export class WorkerManager {
    constructor(modeId: string, defaults: Monaco.typescript.LanguageServiceDefaults);
    getLanguageServiceWorker(
      ...resources: Monaco.Uri[]
    ): Promise<Monaco.typescript.TypeScriptWorker>;
  }

  export class LibFiles {
    constructor(worker: WorkerAccessor);
    fetchLibFilesIfNecessary(resources: (Monaco.Uri | null)[]): Promise<void>;
  }

  export const SuggestAdapter: new (
    worker: WorkerAccessor,
  ) => Monaco.languages.CompletionItemProvider;
  export const SignatureHelpAdapter: new (
    worker: WorkerAccessor,
  ) => Monaco.languages.SignatureHelpProvider;
  export const QuickInfoAdapter: new (worker: WorkerAccessor) => Monaco.languages.HoverProvider;
  export const DocumentHighlightAdapter: new (
    worker: WorkerAccessor,
  ) => Monaco.languages.DocumentHighlightProvider;
  export const DefinitionAdapter: new (
    libFiles: LibFiles,
    worker: WorkerAccessor,
  ) => Monaco.languages.DefinitionProvider;
  export const ReferenceAdapter: new (
    libFiles: LibFiles,
    worker: WorkerAccessor,
  ) => Monaco.languages.ReferenceProvider;
  export const OutlineAdapter: new (
    worker: WorkerAccessor,
  ) => Monaco.languages.DocumentSymbolProvider;
  export const RenameAdapter: new (
    libFiles: LibFiles,
    worker: WorkerAccessor,
  ) => Monaco.languages.RenameProvider;
  export const FormatAdapter: new (
    worker: WorkerAccessor,
  ) => Monaco.languages.DocumentRangeFormattingEditProvider;
  export const FormatOnTypeAdapter: new (
    worker: WorkerAccessor,
  ) => Monaco.languages.OnTypeFormattingEditProvider;
  export const CodeActionAdaptor: new (
    worker: WorkerAccessor,
  ) => Monaco.languages.CodeActionProvider;
  export const InlayHintsAdapter: new (
    worker: WorkerAccessor,
  ) => Monaco.languages.InlayHintsProvider;

  export class DiagnosticsAdapter {
    constructor(
      libFiles: LibFiles,
      defaults: Monaco.typescript.LanguageServiceDefaults,
      selector: string,
      worker: WorkerAccessor,
    );
    dispose(): void;
  }
}
