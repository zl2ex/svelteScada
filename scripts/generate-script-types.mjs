import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(root, "src/lib/client/editor/script/scriptApi.ts");
const project = resolve(root, "scripts/tsconfig.script-types.json");
const outDir = resolve(root, "generated");
const temporary = resolve(outDir, ".scriptApi.generated.d.ts");
const output = resolve(outDir, "scriptApi.d.ts");
const elementOutput = resolve(outDir, "scriptElementBindings.d.ts");
const eventOutput = resolve(outDir, "scriptEventBindings.d.ts");
const tagOutput = resolve(outDir, "scriptTagBindings.d.ts");
const bin = resolve(root, "node_modules/dts-bundle-generator/dist/bin/dts-bundle-generator.js");

mkdirSync(outDir, { recursive: true });

const generated = spawnSync(
  process.execPath,
  [bin, "--project", project, "--no-banner", "--silent", "-o", temporary, entry],
  { cwd: root, encoding: "utf8" },
);

if (generated.status !== 0) {
  process.stderr.write(generated.stderr || generated.stdout || "script type generation failed\n");
  process.exit(generated.status ?? 1);
}

const bundled = readFileSync(temporary, "utf8").trim();
rmSync(temporary, { force: true });

const externalImports = bundled
  .split("\n")
  .filter((line) => /^\s*import\s/.test(line) || /^\s*export\s.+\sfrom\s+["']/.test(line));

if (externalImports.length > 0) {
  process.stderr.write(
    `script types must be self-contained, found:\n${externalImports.join("\n")}\n`,
  );
  process.exit(1);
}

const tagReaders = `  /**
   * Looks up a tag by id or full path.
   * @param lookup - Tag id or full path.
   * @returns The tag entry, or undefined when no tag matches.
   * @example
   * const t = tag("Plant/Line1/Temperature");
   * if(t.isOk) {
   *  const value = t.value.value;
   * }
   * else {
   *  console.error(t.error);
   * }
   */
  const tag: (lookup: keyof ScriptTagPaths) => ScriptTagEntry | undefined;

  /**
   * Returns a resolved tag value by id or full path.
   * @param lookup - Tag id or full path.
   * @returns The resolved tag value, or undefined when the tag is missing or not connected.
   * @example
   * const value = tagValue("Plant/Line1/Temperature")?.value;
   */
  const tagValue: (lookup: keyof ScriptTagPaths) => ScriptTagValue | undefined;

  /**
   * Returns a tag's live status by id or full path.
   * @param lookup - Tag id or full path.
   * @returns The tag status.
   * @example
   * const status = tagStatus("Plant/Line1/Temperature");
   */
  const tagStatus: (lookup: keyof ScriptTagPaths) => ScriptTagStatus;`;

const elementGlobals = `declare global {
  /** Known tag paths available to tag(), tagValue(), and tagStatus(). */
  interface ScriptTagPaths {}

${tagReaders}

  /** The element currently being edited. */
  const element: ScriptCurrentElement;

  /**
   * Looks up another element by id.
   * @param id - Element id, or null/undefined to return undefined.
   * @returns The element snapshot, or undefined when no element matches.
   * @example
   * const parent = getElementById(element.parentId);
   */
  const getElementById: (id: string | null | undefined) => ScriptElement | undefined;
}

export {};`;

const eventGlobals = `declare global {
  /** Known tag paths available to tag(), tagValue(), and tagStatus(). */
  interface ScriptTagPaths {}

${tagReaders}

  /** The element currently being edited. */
  const element: ScriptCurrentElement;

  /**
   * Looks up another element by id.
   * @param id - Element id, or null/undefined to return undefined.
   * @returns The element snapshot, or undefined when no element matches.
   * @example
   * const parent = getElementById(element.parentId);
   */
  const getElementById: (id: string | null | undefined) => ScriptElement | undefined;

  /** The DOM event that triggered this script. */
  const event: ScriptEvent;

  /**
   * Writes a value to a tag.
   * @param lookup - Tag id or full path.
   * @param value - Value to write.
   * @returns A wire result describing success or failure.
   * @example
   * const result = await writeTag("Plant/Line1/Setpoint", 42);
   */
  const writeTag: ScriptEventGlobals["writeTag"];

  /**
   * Navigates to a URL.
   * @param url - Destination URL.
   * @param options - Optional navigation options.
   * @returns A promise that resolves when navigation completes.
   * @example
   * await goto("/plant/line-1");
   */
  const goto: ScriptGoto;

  /**
   * Shows a toast notification.
   * @param message - Toast content and severity.
   * @returns The toast result.
   * @example
   * toast({ kind: "success", title: "Saved" });
   */
  const toast: ScriptToast;
}

export {};`;

const tagGlobals = `declare global {
  /** The tag currently being edited. */
  const tagConfig: ScriptCurrentTagConfig;

  /** The tag's effective properties. */
  const properties: ScriptTagProperties;
}

export {};`;

writeFileSync(output, `${bundled}\n`);
writeFileSync(elementOutput, `${bundled}\n\n${elementGlobals}\n`);
writeFileSync(eventOutput, `${bundled}\n\n${eventGlobals}\n`);
writeFileSync(tagOutput, `${bundled}\n\n${tagGlobals}\n`);
console.log(`generated ${output}`);
console.log(`generated ${elementOutput}`);
console.log(`generated ${eventOutput}`);
console.log(`generated ${tagOutput}`);
