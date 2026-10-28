// Audit optional native/mobile peers without running install scripts or tools.
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnCommandSync } from '../js/scripts/command-process.mjs';
import { desktopPackageJson } from '../js/scripts/prepare-desktop.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'dev/log/issues/50/pulls/51/research');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const fixture = await mkdtemp(path.join(os.tmpdir(), 'issue50-peer-audit-'));
try {
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(fixture, 'package.json'),
    JSON.stringify({
      name: 'issue50-optional-peer-audit',
      version: '1.0.0',
      private: true,
      dependencies: pkg.peerDependencies,
      overrides: desktopPackageJson(pkg).overrides,
    })
  );
  const install = spawnCommandSync(
    'npm',
    [
      'install',
      '--package-lock-only',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    { cwd: fixture, encoding: 'utf8' }
  );
  if (install.status !== 0) {
    throw new Error(install.stdout + install.stderr);
  }
  await writeFile(
    path.join(output, 'optional-peer-lock.json'),
    await readFile(path.join(fixture, 'package-lock.json'))
  );
  const audit = spawnCommandSync('npm', ['audit', '--json'], {
    cwd: fixture,
    encoding: 'utf8',
  });
  await writeFile(path.join(output, 'optional-peer-audit.json'), audit.stdout);
  const report = JSON.parse(audit.stdout);
  console.log(report.metadata.vulnerabilities);
  if (audit.status !== 0) {
    throw new Error('Optional peer audit failed; see saved report');
  }
} finally {
  await rm(fixture, { recursive: true, force: true });
}
