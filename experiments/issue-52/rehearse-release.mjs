// Exercise the production version scripts without publishing or touching this
// checkout. npm is offline; only the already installed Changesets CLI is used.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withoutReleaseVersion } from '../../js/scripts/validated-release-tree.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = join(root, 'node_modules/.cache');
mkdirSync(cache, { recursive: true });
const fixture = mkdtempSync(join(cache, 'issue52-release-'));
const lock = readFileSync(join(root, 'package-lock.json'), 'utf8');
const version = JSON.parse(lock).version;
const nextVersion = `${Number(version.split('.')[0]) + 1}.0.0`;
try {
  for (const layout of ['root', 'js']) {
    for (const mode of ['changeset-version', 'instant-version-bump']) {
      const cwd = join(fixture, `${layout}-${mode}`);
      const pkgRoot = layout === 'root' ? cwd : join(cwd, 'js');
      mkdirSync(join(pkgRoot, '.changeset'), { recursive: true });
      cpSync(join(root, 'package.json'), join(pkgRoot, 'package.json'));
      writeFileSync(join(pkgRoot, 'package-lock.json'), lock);
      writeFileSync(
        join(pkgRoot, 'CHANGELOG.md'),
        `# Changelog\n\n## ${version}\n\nPrevious release\n`
      );
      cpSync(
        join(root, '.changeset/config.json'),
        join(pkgRoot, '.changeset/config.json')
      );
      writeFileSync(
        join(pkgRoot, '.changeset/fixture.md'),
        '---\n"meta-sovereign": major\n---\n\nRelease rehearsal.\n'
      );
      const args = [join(root, `js/scripts/${mode}.mjs`), '--js-root', pkgRoot];
      if (mode === 'instant-version-bump') {
        args.push('--bump-type', 'major', '--description', 'Release rehearsal');
      }
      const output = execFileSync('node', args, {
        cwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          npm_config_offline: 'true',
          npm_config_ignore_scripts: 'true',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const manifest = JSON.parse(
        readFileSync(join(pkgRoot, 'package.json'), 'utf8')
      );
      const after = readFileSync(join(pkgRoot, 'package-lock.json'), 'utf8');
      assert.equal(manifest.version, nextVersion, output);
      assert.equal(JSON.parse(after).packages[''].version, nextVersion);
      assert.equal(
        withoutReleaseVersion('package-lock.json', after),
        withoutReleaseVersion('package-lock.json', lock)
      );
      assert.ok(
        readFileSync(join(pkgRoot, 'CHANGELOG.md'), 'utf8').includes(
          `## ${nextVersion}`
        )
      );
      console.log(
        `${layout}/${mode}: ${version} -> ${nextVersion}, locked dependency tree unchanged`
      );
    }
  }
} catch (error) {
  console.error(error.stdout?.toString(), error.stderr?.toString());
  throw error;
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
