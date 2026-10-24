## Todo

Change the UI of the Bindings to align one to one with Element Attributes, so that for example width has a standard <input> with a bindings button to the right.
with no binding the user just enters the value for the attribute into the <input>.
if the user clicks on the binding button open a <Popover> with the binding script to edit, if the binding script exists disable the <input> but show the result of the binding script and show the binding button with color-primary.
the only thing i want to check is if it is better to keep a seperate binding and attributes row in the database or type the attribures row like {value, binding:? } so if the binding exists it overrides the value in the render stage.

add back button for going back through focused items

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://kit.svelte.dev/docs/adapters) for your target environment.

## Patch: typed `$live` module declarations in `svelte-realtime`

`svelte-realtime` generates `src/live/$types.d.ts`, which contains ambient
`declare module '$live/...'` declarations for the live modules. Without this
patch, types referenced by the generated signatures (e.g. `TagValueState` in
`getTagValue`) are never imported, so they silently degrade to `any`.

The patch makes the generator re-emit `import type { ... }` lines inside each
ambient declaration for every type the generated signatures reference, resolving
them from their original (non-relative) module specifier.

> **Caveat:** relative imports are illegal inside ambient module declarations
> (TS2439: "cannot reference module through relative module name"). Types that
> live in the live module itself (e.g. `TagValueState`) must therefore be moved
> to a `$lib` module so they are reachable via a path alias. In this project
> they live in `src/lib/server/tag/tagValueState.ts`.
>
> The patch sits in `node_modules` and is lost on `npm install`. Re-apply it by
> running the following against `node_modules/svelte-realtime/vite.js`
> (svelte-realtime 0.5.10).

### 1. Insert one line in `_generateTypeDeclarations`

After the `import type { Readable } from 'svelte/store';` push (around line 2490):

```js
declarations.push(`  import type { Readable } from 'svelte/store';`);
declarations.push(..._buildTypeImportLines(exports.join("\n"), _collectImportMap(source), rel));
```

### 2. Add the three helper functions

Add these at file scope (e.g. right after `_generateTypeDeclarations`):

```js
function _collectImportMap(source) {
  const map = {};
  const re = /\bimport\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const spec = m[2];
    for (const raw of m[1].split(",")) {
      const part = raw.trim().replace(/^type\s+/, "");
      if (!part) continue;
      const name = part
        .split(/\s+as\s+/)
        .pop()
        .trim();
      if (name) map[name] = spec;
    }
  }
  return map;
}

function _collectIdentifiers(text) {
  const ids = new Set();
  const re = /[A-Za-z_$][\w$]*/g;
  let m;
  while ((m = re.exec(text)) !== null) ids.add(m[0]);
  return ids;
}

function _buildTypeImportLines(exportsText, importMap, rel) {
  const bySpec = new Map();
  for (const name of _collectIdentifiers(exportsText)) {
    if (importMap[name]) {
      if (!bySpec.has(importMap[name])) bySpec.set(importMap[name], new Set());
      bySpec.get(importMap[name]).add(name);
    }
  }
  const lines = [];
  for (const [spec, names] of bySpec) {
    lines.push(`  import type { ${[...names].sort().join(", ")} } from '${spec}';`);
  }
  return lines;
}
```

### Result

`src/live/$types.d.ts` then contains, e.g.:

```ts
declare module '$live/tags' {
  import type { StreamStore, RpcError } from 'svelte-realtime/client';
  import type { Readable } from 'svelte/store';
  import type { TravelPatches } from 'travels';
  import type { TagValueState } from '$lib/server/tag/tagValueState';
  // ...
  export const getTagValue: ((lookup: string) => StreamStore<TagValueState | undefined | { error: RpcError }>) & { load(...): Promise<TagValueState> };
}
```

so `getTagValue(lookup).rune().current` is typed as
`TagValueState | { error: RpcError } | undefined` instead of `any`.

Note: the dev server must be restarted after re-applying the patch — a running
server holds the old generator and will rewrite `src/live/$types.d.ts` on any
`src/live/` change, including changes to `$types.d.ts` itself.
