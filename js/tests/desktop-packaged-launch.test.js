import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPackagedWindow } from '../../experiments/issue-56/desktop-packaged-launch.mjs';
import { encodeWire, LINO_TEXT } from '../src/transport/lino.js';

const fixture = ({ packaged = true, status = 200, degraded = false } = {}) => ({
  firstWindow: async () => ({
    waitForURL: async (pattern) => {
      assert.equal(pattern.test('http://127.0.0.1:12345/'), true);
      assert.equal(pattern.test('http://127.0.0.1:12345/#/chat'), true);
      assert.equal(pattern.test('http://other.example:12345/#/chat'), false);
    },
    waitForFunction: async () => {},
    evaluate: async () => ({
      status,
      type: LINO_TEXT,
      text: encodeWire({ ok: true, store: { degraded } }, LINO_TEXT).toString(),
    }),
  }),
  evaluate: async () => ({
    packaged,
    windows: 1,
    visible: true,
    contextIsolation: true,
    nodeIntegration: false,
  }),
});

test(
  'packaged launch refuses a checkout, unready backend and degraded storage',
  { timeout: 5000 },
  async () => {
    for (const [options, reason] of [
      [{ packaged: false }, /protected visible window/],
      [{ status: 423 }, /backend/],
      [{ degraded: true }, /storage/],
    ]) {
      await assert.rejects(inspectPackagedWindow(fixture(options)), reason);
    }
    assert.equal(
      (await inspectPackagedWindow(fixture())).native.packaged,
      true
    );
  }
);
