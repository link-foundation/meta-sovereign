// Issue #31 / PR #34: sentence case for standalone UI strings (buttons,
// labels, options, placeholders, statuses) in the cased locales. Keys
// that are fragments inside other sentences stay lowercase and are
// capitalised at render time instead.
//
//   node experiments/sentence-case-keys.mjs keys.txt
import fs from 'node:fs';

const keys = fs
  .readFileSync(process.argv[2], 'utf8')
  .split('\n')
  .map((line) => line.split('\t')[0].trim())
  .filter(Boolean);
for (const locale of ['en', 'ru']) {
  const file = `js/src/web/locales/${locale}.js`;
  let source = fs.readFileSync(file, 'utf8');
  let changed = 0;
  for (const key of keys) {
    const name = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`('${name}':\\s*['"])(\\p{Ll})`, 'u');
    source = source.replace(re, (m, head, letter) => {
      changed += 1;
      return head + letter.toLocaleUpperCase(locale);
    });
  }
  fs.writeFileSync(file, source);
  console.log(locale, changed);
}
