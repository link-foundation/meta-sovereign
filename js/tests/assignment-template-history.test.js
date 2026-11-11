import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { seedAssignmentHistory } from '../src/assignments/github-seed.js';
import { runAssignmentCommand } from '../src/assignments/commands.js';

const identity = [
  '-c',
  'user.name=Assignment Fixture',
  '-c',
  'user.email=assignment-fixture@example.test',
  '-c',
  'commit.gpgsign=false',
];
const fixture = async (t, { sharedHistory = false } = {}) => {
  const root = await mkdtemp(path.join(tmpdir(), 'assignment-history-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const template = path.join(root, 'template');
  const work = path.join(root, 'work');
  const target = path.join(root, 'target.git');
  const git = (args, cwd) => runAssignmentCommand('git', args, { cwd });
  await git(['init', '--initial-branch=main', template]);
  await mkdir(path.join(template, '.github/workflows'), { recursive: true });
  await writeFile(
    path.join(template, '.github/workflows/check.yml'),
    'name: Fixture\non: push\njobs: {}\n'
  );
  await writeFile(path.join(template, 'README.md'), 'Template readme\n');
  await git(['add', '.'], template);
  await git([...identity, 'commit', '-m', 'Template history'], template);
  const original = (await git(['rev-parse', 'HEAD'], template)).stdout.trim();
  if (sharedHistory) {
    await git(['clone', '--', template, work]);
    await git(['rm', '.github/workflows/check.yml'], work);
  } else {
    await git(['init', '--initial-branch=main', work]);
  }
  await writeFile(
    path.join(work, 'README.md'),
    'Owner documentation must survive\n'
  );
  await writeFile(path.join(work, 'owner.txt'), 'Existing work\n');
  await git(['add', '.'], work);
  await git([...identity, 'commit', '-m', 'Existing owner work'], work);
  await git(['clone', '--bare', '--', work, target]);
  const calls = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === 'gh' && args[0] === 'repo' && args[1] === 'clone') {
      const source = args[2].includes('templates/') ? template : target;
      return git(['clone', '--', source, args[3]]);
    }
    const mapped = args.map((value) =>
      value === 'https://github.com/templates/pipeline'
        ? template
        : value === 'https://github.com/owner/result.git'
          ? target
          : value
    );
    try {
      return await runAssignmentCommand(command, mapped, options);
    } catch (error) {
      // This fixture contains no owner data; retain exact failed Git evidence in CI.
      console.error(
        '[assignment-history-fixture]',
        JSON.stringify({
          command,
          args: mapped,
          code: error.code,
          stderr: error.commandError,
        })
      );
      throw error;
    }
  };
  const show = (file) => git(['--git-dir', target, 'show', `main:${file}`]);
  return { root, run, show, calls, template, target, original, git };
};

test(
  'existing unrelated history gains actual template files without losing owner files',
  { timeout: 15000 },
  async (t) => {
    const env = await fixture(t);
    await seedAssignmentHistory({
      run: env.run,
      target: 'owner/result',
      template: 'templates/pipeline',
      existing: true,
    });
    assert.equal(
      (await env.show('README.md')).stdout,
      'Owner documentation must survive\n'
    );
    assert.equal((await env.show('owner.txt')).stdout, 'Existing work\n');
    assert.match(
      (await env.show('.github/workflows/check.yml')).stdout,
      /name: Fixture/u
    );
    await env.git([
      '--git-dir',
      env.target,
      'merge-base',
      '--is-ancestor',
      env.original,
      'main',
    ]);
    assert.ok(!env.calls.some((call) => call.args.includes('--force')));
    await assert.rejects(readFile(env.calls[0].args[3]), { code: 'ENOENT' });
  }
);

test(
  'a previously deleted pipeline is restored even when template history is already present',
  { timeout: 15000 },
  async (t) => {
    const env = await fixture(t, { sharedHistory: true });
    await seedAssignmentHistory({
      run: env.run,
      target: 'owner/result',
      template: 'templates/pipeline',
      existing: true,
    });
    assert.match(
      (await env.show('.github/workflows/check.yml')).stdout,
      /name: Fixture/u
    );
    assert.equal(
      (await env.show('README.md')).stdout,
      'Owner documentation must survive\n'
    );
  }
);

test(
  'non-template seeding pushes the source commit history into an empty repository',
  { timeout: 15000 },
  async (t) => {
    const env = await fixture(t);
    await rm(env.target, { recursive: true, force: true });
    await env.git(['init', '--bare', '--initial-branch=main', env.target]);
    await seedAssignmentHistory({
      run: env.run,
      target: 'owner/result',
      template: 'templates/pipeline',
      existing: false,
    });
    assert.equal(
      (
        await env.git(['--git-dir', env.target, 'rev-parse', 'main'])
      ).stdout.trim(),
      env.original
    );
    assert.match(
      (await env.show('.github/workflows/check.yml')).stdout,
      /name: Fixture/u
    );
  }
);

test(
  'command abort drains the owned process without exposing stderr',
  { timeout: 10000 },
  async () => {
    const controller = new AbortController();
    const running = runAssignmentCommand(
      process.execPath,
      [
        '-e',
        "process.stderr.write('fixture-private-output');setInterval(()=>{},1000)",
      ],
      { signal: controller.signal }
    );
    const rejected = assert.rejects(
      running,
      (error) =>
        error.code === 'assignment-stopped' &&
        !error.message.includes('fixture-private-output')
    );
    controller.abort();
    await rejected;
  }
);

test('failed command stderr stays bounded and private for fixture diagnostics', async () => {
  await assert.rejects(
    runAssignmentCommand(process.execPath, [
      '-e',
      "process.stderr.write('fixture-private-error');process.exit(2)",
    ]),
    (error) => {
      assert.equal(error.code, 'assignment-command');
      assert.equal(error.commandError, 'fixture-private-error');
      assert.ok(!error.message.includes('fixture-private-error'));
      assert.ok(!JSON.stringify(error).includes('fixture-private-error'));
      return true;
    }
  );
});
