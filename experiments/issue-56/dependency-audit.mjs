// Read-only, sequential checks against primary npm registry metadata.
// Run: node experiments/issue-56/dependency-audit.mjs > /tmp/issue56-dependencies.json
import { readFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const groups = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'overrides',
];
const entries = new Map();
for (const group of groups) {
  for (const [name, constraint] of Object.entries(manifest[group] ?? {})) {
    if (typeof constraint !== 'string') {
      throw new Error(`Inspect nested override: ${name}`);
    }
    const entry = entries.get(name) ?? { name, declared: [] };
    if (constraint.startsWith('$')) {
      // npm's reference override intentionally follows the direct constraint.
      continue;
    }
    entry.declared.push({ group, constraint });
    entries.set(name, entry);
  }
}
// The new required default transport is included before installation.
if (!entries.has('lino-rest-api')) {
  entries.set('lino-rest-api', { name: 'lino-rest-api', declared: [] });
}
const results = [];
for (const entry of entries.values()) {
  const tag = entry.declared.some(({ constraint }) => /\d-/.test(constraint))
    ? 'next'
    : 'latest';
  const url = `https://registry.npmjs.org/${encodeURIComponent(entry.name)}/${tag}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${entry.name}: registry returned ${response.status}`);
  }
  const latest = await response.json();
  results.push({
    ...entry,
    tag,
    latest: latest.version,
    engines: latest.engines,
    source: url,
  });
}
console.log(
  JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)
);
