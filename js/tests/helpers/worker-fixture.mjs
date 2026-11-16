// Relocated copies retain every production source import, including dynamic
// imports. A fixture may then inject a specific operation failure without
// accidentally testing an unrelated missing dependency instead.
import { readFile } from 'node:fs/promises';

export const workerFixtureSource = async () => {
  const entry = new URL('../../bin/server-worker.js', import.meta.url);
  return (await readFile(entry, 'utf8')).replace(
    /'(\.\.\/src\/[^']+)'/g,
    (_whole, relative) => JSON.stringify(new URL(relative, entry).href)
  );
};
