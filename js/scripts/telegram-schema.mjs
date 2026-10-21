#!/usr/bin/env node
// Telegram's API schema, as GramJS reads it (R-Y76). GramJS's own copy
// stops at an older layer, and Telegram sends what that layer cannot
// describe (checklists, newer polls and media) as "unsupported". This
// turns a published schema into the TL text GramJS parses, kept at
// js/src/sources/telegram-api/layer-<N>.tl. Telegram's own page
// (https://core.telegram.org/schema/json) lags the layer its apps speak;
// TDLib's (Boost licence) follows it, its layer in td/telegram/Version.h
// (`MTPROTO_LAYER`):
//
//   curl -sSLO https://raw.githubusercontent.com/tdlib/td/master/td/generate/scheme/telegram_api.tl
//   node js/scripts/telegram-schema.mjs telegram_api.tl 232
//
// (or the JSON: `node js/scripts/telegram-schema.mjs schema.json 225`),
// then point LAYER in js/src/sources/telegram-layer.js at the new file.

import { readFileSync, writeFileSync } from 'node:fs';

// TL's own id: the signed 32-bit number as unsigned hex.
const hexId = (id) => (Number(id) >>> 0).toString(16).padStart(8, '0');

const VECTOR = 'vector#1cb5c415 {t:Type} # [ t ] = Vector t;';

/** One schema entry (`predicate` or `method`) as a TL line. */
export const tlLine = (entry, nameKey) => {
  const name = entry[nameKey];
  if (name === 'vector') {
    return VECTOR;
  }
  const params = entry.params ?? [];
  // A method that wraps another (invokeWithLayer …): its query is `!X`.
  const generic = params.some((p) => p.type === '!X') ? ' {X:Type}' : '';
  const args = params.map((p) => ` ${p.name}:${p.type}`).join('');
  return `${name}#${hexId(entry.id)}${generic}${args} = ${entry.type};`;
};

/** The whole schema as TL text, constructors then `---functions---`. */
export const schemaToTl = (schema, layer) =>
  [
    `// Telegram API layer ${layer}, from https://core.telegram.org/schema/json`,
    ...schema.constructors.map((c) => tlLine(c, 'predicate')),
    '',
    '---functions---',
    '',
    ...schema.methods.map((m) => tlLine(m, 'method')),
    '',
  ].join('\n');

const CONSTRUCTOR = /^[\w.]+#[0-9a-f]+[ ;]/;

/**
 * TDLib's TL text as GramJS reads it: from `---types---` on (above it
 * are TDLib's own test calls), the lines with a constructor id, without
 * comments; then `---functions---` and the methods.
 */
export const tdlibToTl = (text, layer) => {
  const lines = text.split('\n').map((l) => l.trim());
  const from = lines.indexOf('---types---');
  const out = [`// Telegram API layer ${layer}, from TDLib's telegram_api.tl`];
  for (const line of lines.slice(from + 1)) {
    if (line === '---functions---') {
      out.push('', line, '');
    } else if (CONSTRUCTOR.test(line)) {
      out.push(line);
    }
  }
  return [...out, ''].join('\n');
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, layer] = process.argv.slice(2);
  if (!input || !/^\d+$/.test(layer ?? '')) {
    console.error(
      'usage: telegram-schema.mjs <telegram_api.tl | schema.json> <layer>'
    );
    process.exit(2);
  }
  const out = new URL(
    `../src/sources/telegram-api/layer-${layer}.tl`,
    import.meta.url
  );
  const text = readFileSync(input, 'utf8');
  writeFileSync(
    out,
    input.endsWith('.json')
      ? schemaToTl(JSON.parse(text), layer)
      : tdlibToTl(text, layer)
  );
  console.log(`wrote ${out.pathname}`);
}
