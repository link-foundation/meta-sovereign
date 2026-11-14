import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { inspectCurrentFormSession } from '../src/forms/inspection.js';
import { captureReviewTargets } from '../src/forms/review-targets.js';

const environment = () => {
  let ticks = 1000;
  let nonce = 0;
  const document = () => ({
    location: { href: 'https://example.test/form' },
    title: 'Clock regression',
    querySelectorAll: () => [],
  });
  const globals = {
    document: document(),
    performance: {
      get timeOrigin() {
        return ticks++;
      },
    },
    crypto: { getRandomValues: (value) => value.fill(++nonce) },
  };
  const context = vm.createContext(globals);
  const evaluate = async (fn, input = {}) =>
    vm.runInContext(`(${fn.toString()})(${JSON.stringify(input)})`, context);
  const frame = { evaluate };
  const session = {
    commander: { evaluate: ({ fn, args }) => evaluate(fn, args?.[0]) },
    page: { mainFrame: () => frame, frames: () => [frame] },
  };
  const capture = async () => {
    let snapshot;
    const report = await inspectCurrentFormSession(session, {
      onSnapshot: (value) => {
        snapshot = value;
      },
    });
    return {
      report,
      snapshot,
      targets: await captureReviewTargets(snapshot, []),
    };
  };
  return {
    capture,
    globals,
    jump: () => {
      ticks += 100000;
    },
    reload: () => {
      globals.document = document();
    },
  };
};

test(
  'clock drift does not replace a document during inspection or reviewed application',
  { timeout: 2000 },
  async () => {
    const env = environment();
    const { report, snapshot, targets } = await env.capture();
    try {
      assert.equal(report.ok, true);
      assert.equal(report.frames.length, 1);
      assert(!JSON.stringify(report).includes('documentKey'));
      assert(!JSON.stringify(report).includes('documentTime'));
      env.jump();
      env.globals.document.querySelectorAll = () => {
        throw new Error('Identity checks must not scan form controls.');
      };
      await targets.check();
      assert.equal(typeof snapshot.frames[0].documentKey, 'string');
      assert(snapshot.frames[0].documentKey.length <= 64);
    } finally {
      await targets.dispose();
    }
  }
);

test(
  'same-URL reload and changed URL still refuse the old reviewed document',
  { timeout: 2000 },
  async () => {
    const env = environment();
    Object.defineProperty(env.globals.performance, 'timeOrigin', {
      value: 1000,
    });
    const first = await env.capture();
    try {
      env.reload();
      await assert.rejects(first.targets.check(), { code: 'form-changed' });
      const second = await env.capture();
      try {
        assert.notEqual(
          first.snapshot.frames[0].documentKey,
          second.snapshot.frames[0].documentKey
        );
        env.globals.document.location.href += '?page=2';
        await assert.rejects(second.targets.check(), { code: 'form-changed' });
      } finally {
        await second.targets.dispose();
      }
    } finally {
      await first.targets.dispose();
    }
  }
);
