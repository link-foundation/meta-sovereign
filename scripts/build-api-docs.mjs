#!/usr/bin/env node
/**
 * Build API documentation by walking the JS modules and extracting
 * leading JSDoc-style block comments + exported identifiers. We do not
 * use TypeDoc because the project deliberately avoids runtime deps; a
 * tiny generator keeps the install footprint zero.
 *
 * Usage: node scripts/build-api-docs.mjs [out-dir]
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.resolve(root, process.argv[2] ?? 'docs/api');
const srcDir = path.resolve(root, 'src');

const walk = async (dir, acc = []) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(p, acc);
    } else if (e.isFile() && p.endsWith('.js')) {
      acc.push(p);
    }
  }
  return acc;
};

const headerComment = (text) => {
  const m = text.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  if (!m) {
    return '';
  }
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trimEnd())
    .join('\n')
    .trim();
};

const exportNames = (text) => {
  const names = new Set();
  const patterns = [
    /export\s+const\s+([A-Za-z_$][\w$]*)/g,
    /export\s+function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+class\s+([A-Za-z_$][\w$]*)/g,
    /export\s+async\s+function\s+([A-Za-z_$][\w$]*)/g,
    /export\s*\{\s*([^}]+)\}/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      if (re.source.includes('\\{')) {
        for (const part of m[1].split(',')) {
          const id = part.split(/\s+as\s+/)[0].trim();
          if (id) {
            names.add(id);
          }
        }
      } else {
        names.add(m[1]);
      }
    }
  }
  return [...names];
};

const renderModule = (relPath, text) => {
  const lines = [`## \`${relPath}\``, ''];
  const header = headerComment(text);
  if (header) {
    lines.push(header, '');
  }
  const names = exportNames(text);
  if (names.length > 0) {
    lines.push('**Exports**', '');
    for (const n of names.sort()) {
      lines.push(`- \`${n}\``);
    }
    lines.push('');
  }
  return lines.join('\n');
};

const files = (await walk(srcDir)).sort();
await fs.mkdir(outDir, { recursive: true });

const sections = [];
sections.push(
  '# meta-sovereign API reference',
  '',
  'Generated from JSDoc-style module headers and `export` statements.',
  'Re-run with `npm run docs:api`.',
  ''
);
for (const file of files) {
  const text = await fs.readFile(file, 'utf8');
  sections.push(renderModule(path.relative(root, file), text));
}
const outFile = path.join(outDir, 'README.md');
await fs.writeFile(outFile, sections.join('\n'));
console.log(`wrote ${outFile} (${files.length} modules)`);
