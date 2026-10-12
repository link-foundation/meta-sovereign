// PR #34 review: list the i18n keys rendered as button text, i.e. the
// t('key') calls among the children of el('button', …) (or of a
// <button> in JSX-free React.createElement calls), so their English and
// Russian strings can follow the sentence-case convention for buttons.
//
//   node experiments/button-label-keys.mjs [srcDir=js/src/web]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('js/package.json'));
const espree = require('espree');
const dir = process.argv[2] ?? 'js/src/web';

const files = fs
  .readdirSync(dir, { recursive: true })
  .filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'))
  .map((f) => path.join(dir, f));

const keys = new Map();
const walk = (node, visit) => {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visit(node);
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child.type === 'string') {
        walk(child, visit);
      }
    }
  }
};
const tKeys = (node, out) =>
  walk(node, (n) => {
    if (
      n.type === 'CallExpression' &&
      n.callee.type === 'Identifier' &&
      n.callee.name === 't' &&
      n.arguments[0]?.type === 'Literal'
    ) {
      out.push(n.arguments[0].value);
    }
  });

for (const file of files) {
  const ast = espree.parse(fs.readFileSync(file, 'utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'module',
  });
  walk(ast, (n) => {
    if (
      n.type === 'CallExpression' &&
      n.arguments[0]?.type === 'Literal' &&
      n.arguments[0].value === 'button'
    ) {
      const found = [];
      // Children only: aria-label/title props are not visible text.
      for (const child of n.arguments.slice(2)) {
        tKeys(child, found);
      }
      for (const k of found) {
        keys.set(k, [...(keys.get(k) ?? []), path.basename(file)]);
      }
    }
  });
}
for (const [k, where] of [...keys].sort()) {
  console.log(`${k}\t${[...new Set(where)].join(',')}`);
}
