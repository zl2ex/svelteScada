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
const bin = resolve(root, "node_modules/dts-bundle-generator/dist/bin/dts-bundle-generator.js");

mkdirSync(outDir, { recursive: true });

const generated = spawnSync(
  process.execPath,
  [
    bin,
    "--project",
    project,
    "--no-banner",
    "--silent",
    "-o",
    temporary,
    entry,
  ],
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
  .filter(
    (line) =>
      /^\s*import\s/.test(line) ||
      /^\s*export\s.+\sfrom\s+["']/.test(line),
  );

if (externalImports.length > 0) {
  process.stderr.write(
    `script types must be self-contained, found:\n${externalImports.join("\n")}\n`,
  );
  process.exit(1);
}

const globals = `declare global {
  interface ScriptTagPaths {}

  const tag: (lookup: keyof ScriptTagPaths | (string & {})) => ScriptTagEntry | undefined;
  const tagValue: (lookup: keyof ScriptTagPaths | (string & {})) => ScriptTagValue | undefined;
  const tagStatus: (lookup: keyof ScriptTagPaths | (string & {})) => ScriptTagStatus;
  const props: ScriptElementAttributes;
  const element: ScriptElement;
  const writeTag: ScriptEventGlobals["writeTag"];
  const goto: ScriptGoto;
  const toast: ScriptToast;
}

export {};`;

writeFileSync(output, `${bundled}\n\n${globals}\n`);
console.log(`generated ${output}`);
