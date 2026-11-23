import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runnerGraphFixture } from './runner-graph-fixture.mjs';

const artifact = 'vendor/picomatch/picomatch-4.0.7-patched.1.tgz';

/** Use the repository's small, integrity-locked tarball with native npm. */
export const runnerApplicationFixture = async ({
  brokenSource = false,
  registry,
} = {}) => {
  const fixture = await runnerGraphFixture();
  const { directory } = fixture.target;
  const put = (name, contents) =>
    writeFile(path.join(directory, name), contents);
  try {
    const bytes = await readFile(new URL(`../../${artifact}`, import.meta.url));
    const manifest = JSON.parse(
      await readFile(path.join(directory, 'package.json'))
    );
    const name = 'meta-sovereign';
    const version = '1.0.0';
    const dependencies = { picomatch: `file:${artifact}` };
    const lock = JSON.stringify({
      name,
      version,
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': { name, version, dependencies, bin: manifest.bin },
        'node_modules/picomatch': {
          name: 'meta-sovereign-picomatch',
          version: '4.0.7+patched.1',
          resolved: registry ?? `file:${artifact}`,
          integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
        },
      },
    });
    await mkdir(path.join(directory, path.dirname(artifact)), {
      recursive: true,
    });
    await Promise.all([
      put(artifact, bytes),
      put(
        'package.json',
        JSON.stringify({ ...manifest, version, dependencies })
      ),
      put('package-lock.json', lock),
      ...(!brokenSource
        ? [
            put(
              'js/src/server/required.js',
              'import picomatch from "picomatch"; export const startServer = picomatch("*.js");\n'
            ),
          ]
        : []),
    ]);
    return {
      ...fixture,
      target: {
        ...fixture.target,
        applicationLock: createHash('sha256').update(lock).digest('hex'),
      },
    };
  } catch (error) {
    await fixture.close();
    throw error;
  }
};
