import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { redactLogValue } from '../src/server/log-value.js';

test('lazy native error stacks never inspect accessor name or message fields', () => {
  for (const field of ['name', 'message']) {
    for (const inherited of [false, true]) {
      let invoked = 0;
      let stackReads = 0;
      const error = new Error('fixture error');
      const target = inherited ? Object.create(Error.prototype) : error;
      if (inherited) {
        delete error[field];
        Object.setPrototypeOf(error, target);
      }
      Object.defineProperty(target, field, {
        configurable: true,
        get: () => {
          invoked++;
          return 'fixture-sensitive';
        },
      });
      // Model engines whose native stack descriptor materializes its value.
      const lazy = new Proxy(error, {
        getOwnPropertyDescriptor: (value, key) => {
          if (key === 'stack') {
            stackReads++;
            return { value: String(value[field]), configurable: true };
          }
          return Reflect.getOwnPropertyDescriptor(value, key);
        },
      });
      const logged = redactLogValue({ error: lazy });
      assert.equal(invoked, 0, `${field}, inherited=${inherited}`);
      assert.equal(stackReads, 0);
      assert.equal(logged.error[field], '[accessor]');
      assert.equal(logged.error.stack, '[accessor]');
    }
  }
});

test('custom error stack formatters are never evaluated', async () => {
  // Bun caches native stack hooks after restoration; isolate the global hook.
  const script = fileURLToPath(
    new URL(
      '../../experiments/issue-56/log-error-formatter.mjs',
      import.meta.url
    )
  );
  const args = process.versions.deno
    ? ['run', '--allow-read', script]
    : [script];
  const { stdout } = await promisify(execFile)(process.execPath, args);
  assert.equal(stdout.trim(), 'formatter remained unused');
});

test('non-string error fields are never coerced', () => {
  let invoked = 0;
  const error = new Error('visible fixture');
  error.message = {
    toString: () => {
      invoked++;
      return 'fixture-sensitive';
    },
  };
  const logged = redactLogValue(error);
  assert.equal(invoked, 0);
  assert.equal(logged.stack, '[accessor]');
  assert.equal(logged.message.toString, '[function]');
});

test('ordinary error identity and redacted message remain useful', () => {
  const logged = redactLogValue(new TypeError('token=fixture-sensitive'));
  assert.equal(logged.name, 'TypeError');
  assert.equal(logged.message.includes('fixture-sensitive'), false);
  assert.equal(typeof logged.stack, 'string');
  for (const field of ['token', 'password', 'api_key']) {
    const value = redactLogValue(new Error(`${field}=fixture-sensitive`));
    assert.equal(value.message.includes('fixture-sensitive'), false, field);
  }
});
