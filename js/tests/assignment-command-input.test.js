import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { runAssignmentCommand } from '../src/assignments/commands.js';

// A command may finish before the parent ends stdin. Reproduce its closed read
// end deterministically, without starting hundreds of Git processes or sleeping.
const commandFixture = async (run, { closedInput = false } = {}) => {
  const original = childProcess.spawn;
  const calls = [];
  childProcess.spawn = (_command, _args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    const call = { options, input: '' };
    calls.push(call);
    child.stdin =
      options.stdio[0] === 'ignore'
        ? null
        : new Writable({
            write(chunk, _encoding, callback) {
              call.input += chunk.toString();
              callback(
                closedInput
                  ? Object.assign(new Error('closed fixture stdin'), {
                      code: 'EPIPE',
                    })
                  : null
              );
            },
          });
    globalThis.setTimeout(() => {
      child.stdout.end('command complete');
      child.stderr.end();
      child.emit('close', 0);
    }, 0);
    return child;
  };
  syncBuiltinESMExports();
  try {
    await run(calls);
  } finally {
    childProcess.spawn = original;
    syncBuiltinESMExports();
  }
};

test(
  'successful commands without input cannot fail from an unused closed stdin pipe',
  { timeout: 5000 },
  async () => {
    await commandFixture(
      async (calls) => {
        assert.equal(
          (await runAssignmentCommand('fixture-git', ['status'])).stdout,
          'command complete'
        );
        assert.equal(calls.length, 1);
        assert.equal(calls[0].input, '');
      },
      { closedInput: true }
    );
  }
);

test(
  'commands with payloads still write exact stdin and refuse failed input writes',
  { timeout: 5000 },
  async () => {
    const input = JSON.stringify({ body: 'reviewed assignment text' });
    await commandFixture(async (calls) => {
      await runAssignmentCommand('fixture-gh', ['api'], { input });
      assert.equal(calls[0].input, input);
    });
    await commandFixture(
      async () => {
        await assert.rejects(
          runAssignmentCommand('fixture-gh', ['api'], { input }),
          { code: 'assignment-input' }
        );
      },
      { closedInput: true }
    );
  }
);
