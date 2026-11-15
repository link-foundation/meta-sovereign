import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const withPackage = async (run) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-release-copy-'));
  const sourceRoot = path.join(dir, 'package');
  const storeDir = path.join(dir, 'store');
  try {
    for (const name of [
      'js/src/nested',
      'js/bin',
      'node_modules/lino-objects-codec',
    ]) {
      await fs.mkdir(path.join(sourceRoot, name), { recursive: true });
    }
    await fs.writeFile(
      path.join(sourceRoot, 'package.json'),
      '{"type":"module"}'
    );
    await fs.writeFile(
      path.join(sourceRoot, 'js/bin/server-worker.js'),
      '// fixture'
    );
    for (let i = 0; i < 12; i += 1) {
      await fs.writeFile(
        path.join(sourceRoot, `js/src/nested/file-${i}.js`),
        `export const value = ${i};`
      );
    }
    await run({ sourceRoot, storeDir, dir });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};
