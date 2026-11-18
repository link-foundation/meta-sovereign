import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import {
  runRunnerCommand,
  createRunnerTransport,
  runnerInvocation,
} from '../src/server/runner-transport.js';

const fixture = fileURLToPath(
  new URL(
    '../../experiments/issue-56/runner-transport-child.mjs',
    import.meta.url
  )
);
const childArgs = (mode, ...values) => [
  process.execPath,
  ...(process.versions.deno ? ['run', '--allow-all', '--no-check'] : []),
  fixture,
  mode,
  ...values,
];

test(
  'local transport preserves literal arguments and bounds captured output',
  { timeout: 5000 },
  async () => {
    const target = { directory: process.cwd() };
    const values = [
      'space value',
      "apostrophe's",
      '$(PRIVATE)',
      ';PRIVATE',
      '--flag',
    ];
    const answer = await runRunnerCommand(target, childArgs('argv', ...values));
    assert.equal(answer.code, 0);
    assert.deepEqual(JSON.parse(answer.stdout), values);
    const large = await runRunnerCommand(target, childArgs('large'));
    assert.equal(large.code, 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER');
    assert.ok(large.stdout.length <= 65536);
    const absent = await runRunnerCommand(target, [
      'meta-sovereign-no-such-test-command',
    ]);
    assert.equal(absent.code, 'ENOENT');
  }
);

test(
  'a real finite child ignoring SIGTERM is killed and reaped on cancellation',
  { timeout: 6000, skip: process.platform === 'win32' },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runner-stubborn-'));
    const abort = new AbortController();
    const phases = [];
    const run = createRunnerTransport({
      killAfterMs: 30,
      trace: (phase) => phases.push(phase),
    });
    let work;
    try {
      const ready = join(dir, 'ready');
      work = run(
        { directory: dir },
        childArgs('stubborn', join(dir, 'unused'), ready),
        { signal: abort.signal }
      );
      let began = false;
      for (let attempt = 0; attempt < 100 && !began; attempt += 1) {
        began = await readFile(ready, 'utf8').then(
          () => true,
          () => false
        );
        if (!began) {
          await pause(10);
        }
      }
      assert.equal(began, true);
      abort.abort();
      const result = await work;
      assert.equal(result.aborted, true);
      assert.equal(result.code, 'ABORT_ERR');
      assert.deepEqual(phases, ['cancel', 'force-kill', 'closed']);
    } finally {
      abort.abort();
      await work;
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'SSH sends a fixed command and quoted stdin script; shell metacharacters stay literal',
  {
    timeout: 5000,
    skip: process.platform === 'win32',
  },
  async () => {
    const values = [
      'with space',
      "apostrophe's",
      '$(printf WRONG)',
      ';printf WRONG',
      'a\nb',
    ];
    const invocation = runnerInvocation(
      { directory: process.cwd(), host: 'fixture@example.invalid' },
      childArgs('argv', ...values)
    );
    assert.equal(invocation.file, 'ssh');
    assert.deepEqual(invocation.args, [
      '-T',
      '-o',
      'BatchMode=yes',
      '--',
      'fixture@example.invalid',
      'sh -s',
    ]);
    const output = await new Promise((resolve, reject) => {
      const child = execFile(
        'sh',
        ['-s'],
        { maxBuffer: 65536 },
        (error, stdout) => (error ? reject(error) : resolve(stdout))
      );
      child.stdin.end(invocation.input);
    });
    assert.deepEqual(JSON.parse(output), values);
  }
);

test(
  'cancellation retains ownership until the real child closes after its delayed cleanup',
  {
    timeout: 6000,
    skip: process.platform === 'win32',
  },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runner-cancel-'));
    const abort = new AbortController();
    let work;
    try {
      const marker = join(dir, 'drained');
      const ready = join(dir, 'ready');
      work = runRunnerCommand(
        { directory: dir },
        childArgs('cancel', marker, ready),
        { signal: abort.signal }
      );
      let began = false;
      for (let attempt = 0; attempt < 100 && !began; attempt += 1) {
        began = await readFile(ready, 'utf8').then(
          () => true,
          () => false
        );
        if (!began) {
          await pause(10);
        }
      }
      assert.equal(began, true);
      abort.abort();
      const answer = await work;
      assert.equal(answer.aborted, true);
      assert.equal(await readFile(marker, 'utf8'), 'drained');
    } finally {
      abort.abort();
      await work;
      await rm(dir, { recursive: true, force: true });
    }
  }
);
