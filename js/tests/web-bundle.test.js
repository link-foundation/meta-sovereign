// Issue #29 / R-V19: the browser bundle must stay browser-only.
//
// `js/src/cv/index.js` drives a real browser from Node — it reaches
// `playwright`, `node:fs/promises` and `node:os`. The source registry
// links job boards to their CV plans, and the SPA imports the
// registry, so a careless (even dynamic) import there breaks
// `npm run build:web` and with it the Pages deployment. This walks the
// SPA's import graph on disk instead of shelling out to esbuild, so it
// runs identically on Node, Bun and Deno.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = dirname(
  fileURLToPath(new URL('../src/web/app.js', import.meta.url))
);
const ENTRY = resolve(WEB_ROOT, 'app.js');
const SRC = resolve(WEB_ROOT, '..');

/**
 * Specifiers of every static import/export-from and every dynamic
 * `import('literal')` in a module. Statements are collected line by
 * line so a multi-line `import { … } from '…'` is read whole without a
 * greedy regex wandering into unrelated code.
 */
export const importSpecifiers = (source) => {
  const specifiers = [];
  let statement = null;
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (statement === null && !/^(import|export)\b/.test(trimmed)) {
      // Dynamic imports can appear anywhere; only literal ones are
      // resolvable (and only literal ones a bundler follows).
      const dynamic = trimmed.match(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/);
      if (dynamic) {
        specifiers.push(dynamic[1]);
      }
      continue;
    }
    statement = statement === null ? trimmed : `${statement} ${trimmed}`;
    const matched = statement.match(/(?:from\s*|^import\s*)['"]([^'"]+)['"]/);
    if (matched) {
      specifiers.push(matched[1]);
      statement = null;
    } else if (/;$/.test(statement)) {
      statement = null; // `export const …` and friends.
    }
  }
  return specifiers;
};

const graph = () => {
  const visited = new Map();
  const walk = (file, from) => {
    if (visited.has(file)) {
      return;
    }
    visited.set(file, from);
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      assert.fail(`${from} imports a missing module: ${file}`);
    }
    for (const specifier of importSpecifiers(source)) {
      if (specifier.startsWith('.')) {
        walk(resolve(dirname(file), specifier), file);
      } else {
        visited.set(specifier, file);
      }
    }
  };
  walk(ENTRY, '(entry)');
  return visited;
};

test('the SPA import graph never reaches a Node-only module', () => {
  const visited = graph();
  const forbidden = [
    /^node:/,
    /^playwright$/,
    /^puppeteer$/,
    /^browser-commander$/,
  ];
  for (const [specifier, importer] of visited) {
    if (specifier.startsWith('/')) {
      continue;
    }
    for (const pattern of forbidden) {
      assert.ok(
        !pattern.test(specifier),
        `${importer.replace(SRC, 'js/src')} imports "${specifier}", which does not exist in a browser bundle`
      );
    }
  }
});

test('the SPA never pulls in the CV runtime, only its plan data', () => {
  const visited = graph();
  const reached = [...visited.keys()].filter((key) => key.startsWith('/'));
  const runtime = reached.filter((file) =>
    /\/src\/cv\/(index|browser|telemetry|runner|store)\.js$/.test(file)
  );
  assert.deepEqual(
    runtime.map((file) => file.replace(SRC, 'js/src')),
    [],
    'the SPA must talk to /api/cv/* instead of importing the CV runtime'
  );
});

test('importSpecifiers reads multi-line, bare and dynamic imports', () => {
  const specifiers = importSpecifiers(
    [
      'import { a,',
      "  b } from './multi.js';",
      "import './bare.js';",
      "export { c } from './re-export.js';",
      'export const d = 1;',
      "const load = () => import('./dynamic.js');",
      "const noise = from('not an import');",
    ].join('\n')
  );
  assert.deepEqual(specifiers, [
    './multi.js',
    './bare.js',
    './re-export.js',
    './dynamic.js',
  ]);
});
