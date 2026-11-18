import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { activateAndWaitForClose } from './helpers/native-action-close.mjs';

test(
  'a rejected close wait is observed while native activation is pending, then both operations drain',
  { timeout: 2000 },
  async () => {
    const refused = new Error('synthetic close deadline');
    let release;
    let finished = false;
    const activation = new Promise((resolve) => {
      release = resolve;
    });
    const closing = activateAndWaitForClose(
      { waitForEvent: () => Promise.reject(refused) },
      () => activation
    );
    const observed = closing.catch((error) => {
      finished = true;
      return error;
    });
    try {
      await setImmediate();
      assert.equal(finished, false, 'the native activation remains owned');
      release();
      assert.equal(await observed, refused);
    } finally {
      release();
      await observed;
    }
  }
);

test(
  'a refused native activation is retained after the close wait drains without retrying',
  { timeout: 2000 },
  async () => {
    const refused = new Error('synthetic unavailable save');
    const calls = [];
    await assert.rejects(
      activateAndWaitForClose(
        {
          waitForEvent: async (event) => {
            calls.push(event);
            throw new Error('synthetic missing closure');
          },
        },
        async () => {
          calls.push('activate');
          throw refused;
        }
      ),
      (error) => error === refused
    );
    assert.deepEqual(calls, ['close', 'activate']);
  }
);

test(
  'native activation and actual closure both remain required for success',
  { timeout: 2000 },
  async () => {
    const calls = [];
    await activateAndWaitForClose(
      {
        waitForEvent: async (event) => {
          calls.push(event);
        },
      },
      async () => {
        calls.push('activate');
      }
    );
    assert.deepEqual(calls, ['close', 'activate']);
  }
);
