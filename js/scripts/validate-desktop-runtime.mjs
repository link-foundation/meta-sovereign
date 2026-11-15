// Check the staged dependency boundary before building installers. No server,
// provider, profile or browser is opened. Called in CI after production install.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, realpath, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const validateDesktopRuntime = async (out) => {
  const pkg = JSON.parse(await readFile(join(out, 'package.json'), 'utf8'));
  const require = createRequire(join(out, 'package.json'));
  const modules = `${await realpath(join(out, 'node_modules'))}${sep}`;
  for (const name of Object.keys(pkg.dependencies)) {
    const resolved = await realpath(require.resolve(name));
    assert.ok(
      resolved.startsWith(modules),
      'Desktop dependency escaped the staged app.'
    );
  }
  const dir = await mkdtemp(join(tmpdir(), 'desktop-runtime-check-'));
  try {
    const { desktopConfiguration } = await import(
      pathToFileURL(join(out, 'js/electron/configuration.js')).href
    );
    const options = await desktopConfiguration(
      ['--port=0', '--verbose=false'],
      {
        cwd: dir,
        globalDir: join(dir, 'user'),
        localDir: join(dir, 'local'),
      }
    );
    assert.equal(options.port, 0);
    assert.equal(options.localUi, true);
    const { startServer } = await import(
      pathToFileURL(join(out, 'js/src/server/index.js')).href
    );
    assert.equal(typeof startServer, 'function');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
