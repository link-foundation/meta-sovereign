// Append translated keys to the four SPA locale dictionaries.
// Usage: node experiments/add-locale-keys.mjs keys.json
// keys.json: { "some.key": { "en": "…", "ru": "…", "zh": "…", "hi": "…" } }
// Existing keys are replaced in place; new ones go before the closing `};`.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../js/src/web/locales/', import.meta.url));
const keys = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

for (const locale of ['en', 'ru', 'zh', 'hi']) {
  const file = `${dir}${locale}.js`;
  let text = readFileSync(file, 'utf8');
  const added = [];
  for (const [key, values] of Object.entries(keys)) {
    const value = values[locale];
    if (value === undefined) {
      throw new Error(`${key}: no ${locale} text`);
    }
    const line = `  ${quote(key)}: ${quote(value)},`;
    const existing = new RegExp(
      `^  ${quote(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:[\\s\\S]*?,\\n(?=  '|  [a-zA-Z]|\\};)`,
      'm'
    );
    if (existing.test(text)) {
      text = text.replace(existing, `${line}\n`);
    } else {
      added.push(line);
    }
  }
  if (added.length) {
    const end = text.lastIndexOf('\n};');
    text = `${text.slice(0, end)}\n${added.join('\n')}${text.slice(end)}`;
  }
  writeFileSync(file, text);
}
