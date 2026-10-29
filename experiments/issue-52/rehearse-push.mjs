// Run the actual version/push CLI against isolated local repositories, offline.
// The pre-push hook advances the remote once, reproducing a real lost race.
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

const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = join(root, 'node_modules/.cache');
mkdirSync(cache, { recursive: true });
const fixture = mkdtempSync(join(cache, 'issue52-push-'));
const env = { ...process.env, npm_config_offline: 'true' };
for (const key of Object.keys(env)) {
  if (key.startsWith('GIT_') || key === 'GITHUB_OUTPUT') {
    delete env[key];
  }
}
const run = (command, args, cwd, extra = {}) =>
  execFileSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 4 * 1024 * 1024,
    ...extra,
  });
const git = (cwd, ...args) => run('git', args, cwd);
const configure = (cwd) => {
  git(cwd, 'config', 'user.name', 'Release fixture');
  git(cwd, 'config', 'user.email', 'fixture@example.invalid');
  git(cwd, 'config', 'core.autocrlf', 'false');
};
const version = JSON.parse(readFileSync(join(root, 'package.json'))).version;
const [major, minor, patch] = version.split('.').map(Number);
const next = (offset) => `${major}.${minor}.${patch + offset}`;
try {
  for (const scenario of ['metadata', 'source', 'policy']) {
    const directory = join(fixture, scenario);
    const origin = join(directory, 'origin.git');
    const client = join(directory, 'client');
    const other = join(directory, 'other');
    mkdirSync(client, { recursive: true });
    git(directory, 'init', '--bare', origin);
    git(client, 'init', '-b', 'main');
    configure(client);
    mkdirSync(join(client, '.changeset'));
    for (const name of ['package.json', 'package-lock.json']) {
      cpSync(join(root, name), join(client, name));
    }
    cpSync(join(root, 'js/scripts'), join(client, 'js/scripts'), {
      recursive: true,
    });
    cpSync(
      join(root, '.changeset/config.json'),
      join(client, '.changeset/config.json')
    );
    writeFileSync(
      join(client, '.changeset/fixture.md'),
      '---\n"meta-sovereign": patch\n---\n\nPending release fixture.\n'
    );
    writeFileSync(
      join(client, 'CHANGELOG.md'),
      `# Changelog\n\n## ${version}\n`
    );
    writeFileSync(join(client, 'app.js'), 'validated source\n');
    git(client, 'add', '.');
    git(client, 'commit', '-m', 'Validated source');
    git(client, 'remote', 'add', 'origin', origin);
    git(client, 'push', '-u', 'origin', 'main');
    git(directory, 'clone', '--branch', 'main', origin, other);
    configure(other);

    const attempts = join(directory, 'attempts');
    const hook = join(directory, 'race.cjs');
    writeFileSync(
      hook,
      `const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const other = ${JSON.stringify(other)};
const attempts = ${JSON.stringify(attempts)};
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
const git = (...args) => execFileSync('git', args, { cwd: other, env, stdio: 'pipe' });
const first = !fs.existsSync(attempts);
fs.appendFileSync(attempts, 'push\\n');
if (${JSON.stringify(scenario)} === 'policy') {
  console.error('GH013: repository rule violation; fetch first');
  process.exit(1);
}
if (first) {
  if (${JSON.stringify(scenario)} === 'source') {
    fs.appendFileSync(other + '/app.js', 'new source\\n');
  } else {
    for (const name of ['package.json', 'package-lock.json']) {
      const file = other + '/' + name;
      const data = JSON.parse(fs.readFileSync(file));
      data.version = ${JSON.stringify(next(1))};
      if (data.packages) data.packages[''].version = data.version;
      fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\\n');
    }
    fs.appendFileSync(other + '/CHANGELOG.md', '\\nConcurrent release metadata\\n');
  }
  git('add', '.');
  git('commit', '-m', 'Concurrent writer');
  git('push', 'origin', 'main');
}
`
    );
    // Quote paths as shell arguments; neither path contains user input.
    const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
    writeFileSync(
      join(client, '.git/hooks/pre-push'),
      `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(hook)}\n`,
      { mode: 0o755 }
    );
    const outputFile = join(directory, 'outputs');
    let output;
    try {
      output = run(
        process.execPath,
        ['js/scripts/version-and-commit.mjs', '--mode', 'changeset'],
        client,
        { env: { ...env, GITHUB_OUTPUT: outputFile } }
      );
      assert.notEqual(scenario, 'policy', output);
    } catch (error) {
      if (scenario !== 'policy' || error.status === undefined) {
        throw error;
      }
      output = `${error.stdout}\n${error.stderr}`;
      assert.match(output, /GH013/);
    }
    const outputs = readFileSync(outputFile, 'utf8');
    const count = readFileSync(attempts, 'utf8').trim().split('\n').length;
    const remote = git(client, 'show', 'origin/main:package.json');
    if (scenario === 'metadata') {
      assert.equal(count, 2, output);
      assert.equal(JSON.parse(remote).version, next(2), output);
      assert.match(outputs, /version_committed=true/);
      assert.equal(outputs.trim().split('\n').at(-2), `new_version=${next(2)}`);
      assert.ok(
        git(client, 'show', 'origin/main:CHANGELOG.md').includes(
          'Concurrent release metadata'
        )
      );
    } else {
      assert.equal(count, 1, output);
      assert.equal(JSON.parse(remote).version, version, output);
      assert.doesNotMatch(outputs, /version_committed=true/);
      if (scenario === 'source') {
        assert.match(output, /Release superseded by newer source/);
        assert.match(outputs, /version_committed=false/);
      }
    }
    console.log(
      `${scenario}: ${count} push attempt(s); remote history preserved`
    );
  }
} catch (error) {
  console.error(error.stdout?.toString(), error.stderr?.toString());
  throw error;
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
