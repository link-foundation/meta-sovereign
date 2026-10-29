// Remove locale entries whose key matches a regexp from every locale file.
// Usage: node experiments/remove-locale-keys.mjs '<regexp>'
// An entry runs from its `  'key':` line to the next key, comment or `};`.
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { safeRegExp, safeTest } from '../js/src/patterns/safe-regex.js';

const pattern = safeRegExp(process.argv[2], '');
const dir = path.resolve('js/src/web/locales');
const start = /^ {2}'([^']+)':/;
const boundary = /^( {2}'[^']+':| {2}\/\/|};)/;
for (const name of ['en.js', 'ru.js', 'zh.js', 'hi.js']) {
  const file = path.join(dir, name);
  const lines = (await fs.readFile(file, 'utf8')).split('\n');
  const out = [];
  let skipping = false;
  let removed = 0;
  for (const line of lines) {
    const m = line.match(start);
    if (m) {
      skipping = safeTest(pattern, m[1]);
      removed += skipping ? 1 : 0;
    } else if (boundary.test(line)) {
      skipping = false;
    }
    if (!skipping) {
      out.push(line);
    }
  }
  await fs.writeFile(file, out.join('\n'));
  console.log(name, removed);
}
