import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureTelegramCrypto } from '../src/sources/telegram-runtime.js';

test('Windows Deno selects portable AES before a native addon can crash', () => {
  for (const previous of [undefined, '1', '0']) {
    const env = previous === undefined ? {} : { CIFRANTE_NATIVE: previous };
    configureTelegramCrypto({ deno: true, platform: 'win32', env });
    assert.equal(env.CIFRANTE_NATIVE, '0');
    configureTelegramCrypto({ deno: true, platform: 'win32', env });
    assert.equal(env.CIFRANTE_NATIVE, '0');
  }
});

test('other runtimes preserve native selection and explicit portable settings', () => {
  for (const deno of [false, true]) {
    for (const platform of ['win32', 'linux', 'darwin']) {
      if (deno && platform === 'win32') {
        continue;
      }
      for (const previous of [undefined, '0', '1']) {
        const env = previous === undefined ? {} : { CIFRANTE_NATIVE: previous };
        const before = { ...env };
        configureTelegramCrypto({ deno, platform, env });
        assert.deepEqual(env, before);
      }
    }
  }
});
