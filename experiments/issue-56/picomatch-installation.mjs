// Focused installer compatibility check; never installs the application tree.
import { execCommandSync } from '../../js/scripts/command-process.mjs';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runtime = process.argv[2];
if (!['bun', 'deno'].includes(runtime)) {
  throw new Error('Choose one runtime: bun or deno');
}
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = mkdtempSync(join(tmpdir(), 'ms-picomatch-install-'));
try {
  for (const name of [
    'vendor/picomatch/picomatch-4.0.7-patched.1.tgz',
    'vendor/picomatch/provenance.json',
    'js/tests/picomatch-security.test.js',
    'experiments/issue-56/picomatch-probe.cjs',
  ]) {
    const target = join(fixture, name);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(root, name), target);
  }
  writeFileSync(
    join(fixture, 'package.json'),
    JSON.stringify({
      name: 'private-picomatch-installation-check',
      private: true,
      type: 'module',
      devDependencies: {
        '@types/node': '26.6.6',
        picomatch: 'file:vendor/picomatch/picomatch-4.0.7-patched.1.tgz',
        tinyglobby: '0.2.17',
      },
      overrides: { picomatch: '$picomatch' },
    })
  );
  cpSync(join(root, 'deno.json'), join(fixture, 'deno.json'));
  const invoke = (command, args) =>
    execCommandSync(command, args, {
      cwd: fixture,
      stdio: 'inherit',
      env: { ...process.env, NO_COLOR: '1' },
    });
  if (runtime === 'bun') {
    invoke('bun', ['install', '--ignore-scripts']);
    invoke('bun', ['test', 'js/tests/picomatch-security.test.js']);
  } else {
    invoke('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
    invoke('deno', [
      'test',
      '--allow-all',
      '--no-lock',
      '--v8-flags=--max-old-space-size=192',
      'js/tests/picomatch-security.test.js',
    ]);
  }
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
