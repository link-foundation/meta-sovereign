import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { dispatchBrowserReply } from '../src/sources/browser-choices.js';
import {
  browserInactiveView,
  linkBrowserInactiveOwner,
} from '../src/sources/browser-inactive-view.js';
import { inactiveViewFixture } from '../../experiments/issue-56/inactive-view-fixture.mjs';

test('inactive input exemption is exactly one owned synthetic event, never a different or trusted event', () => {
  const fixture = inactiveViewFixture();
  const control = (operation) =>
    fixture.evaluate({
      fn: browserInactiveView,
      args: [{ operation, token: 'reply' }],
    });
  control('open');
  const lease =
    fixture.window[Symbol.for('meta-sovereign.browser-inactive-view.v1')];
  const owned = { type: 'input', isTrusted: false };
  lease.ownedInput = owned;
  fixture.document.emit('input', false, owned);
  assert.equal(control('status').state, 'ready');
  fixture.document.emit('input', false);
  assert.equal(control('status').state, 'owner-active');
  control('release');
  control('open');
  const next =
    fixture.window[Symbol.for('meta-sovereign.browser-inactive-view.v1')];
  const trusted = { type: 'input', isTrusted: true };
  next.ownedInput = trusted;
  fixture.document.emit('input', true, trusted);
  assert.equal(control('release').state, 'owner-active');
  assert.equal(fixture.listeners(), 0);
});

test('the embedded final guard latches outer activity through an acknowledged owner relay', async () => {
  for (const activity of ['focus', 'input']) {
    const owner = inactiveViewFixture();
    const child = inactiveViewFixture();
    child.window.top = owner.window;
    for (const [to, from] of [
      [owner, child],
      [child, owner],
    ]) {
      to.window.postMessage = (data) =>
        Promise.resolve().then(() =>
          to.window.emit('message', false, { data, source: from.window })
        );
    }
    const control = (fixture, fn, operation) =>
      fixture.evaluate({
        fn,
        args: [{ operation, token: 'relay' }],
      });
    for (const fixture of [owner, child]) {
      control(fixture, browserInactiveView, 'open');
    }
    try {
      assert.equal(await control(owner, linkBrowserInactiveOwner), true);
      assert.equal(await control(child, linkBrowserInactiveOwner), true);
      assert.equal(await control(child, linkBrowserInactiveOwner), true);
      const message = {
        type: 'meta-sovereign.browser-inactive-owner.v1',
        operation: 'owner-active',
        token: 'relay',
      };
      child.window.emit('message', false, { data: message, source: {} });
      child.window.emit('message', false, {
        data: { ...message, token: 'other' },
        source: owner.window,
      });
      assert.equal(
        control(child, browserInactiveView, 'status').state,
        'ready'
      );
      if (activity === 'focus') {
        owner.focus(true);
        owner.focus(false);
      } else {
        owner.document.emit('input', false);
      }
      await new Promise(setImmediate);
      assert.equal(child.document.hasFocus(), false);
      assert.equal(
        control(child, browserInactiveView, 'status').state,
        'owner-active'
      );
    } finally {
      for (const fixture of [child, owner]) {
        control(fixture, browserInactiveView, 'release');
        assert.equal(fixture.listeners(), 0);
      }
    }
  }
});

test('releasing an unacknowledged embedded relay drains its timer and listener', async () => {
  const child = inactiveViewFixture();
  child.window.top = { postMessage() {} };
  const evaluate = (fn, operation) =>
    child.evaluate({ fn, args: [{ operation, token: 'relay' }] });
  evaluate(browserInactiveView, 'open');
  const pending = evaluate(linkBrowserInactiveOwner);
  evaluate(browserInactiveView, 'release');
  assert.equal(await pending, false);
  assert.equal(child.listeners(), 0);
});

const fixture = () => {
  const events = [];
  const commander = {
    async evaluate({ args: [input] }) {
      events.push(input.operation);
      if (input.operation === 'armText') {
        return { armed: true, selector: '#send' };
      }
      if (input.operation === 'receipt') {
        return { sent: true, messageId: 'receipt' };
      }
      return { released: true };
    },
    async clickButton(options) {
      events.push(options);
    },
  };
  return { commander, events };
};
const request = { text: 'Reviewed reply' };

test('inactive dispatch uses the real control with DOM activation and no scroll; ordinary replies retain pointer defaults', async () => {
  for (const inactiveToken of [undefined, 'owned-reply']) {
    const { commander, events } = fixture();
    const result = await dispatchBrowserReply(commander, request, {
      receiptMs: 50,
      pollMs: 1,
      inactiveToken,
      verifyCurrent: () => events.push('verify'),
    });
    assert.equal(result.messageId, 'receipt');
    assert.deepEqual(
      events.filter((event) => typeof event === 'string'),
      ['verify', 'armText', 'verify', 'receipt', 'release']
    );
    const click = events.find((event) => typeof event === 'object');
    assert.equal(click.scrollIntoView, !inactiveToken);
    assert.equal(click.activation, inactiveToken ? 'dom' : undefined);
    assert.equal(click.scroll, inactiveToken ? 'none' : undefined);
    assert.equal(click.inactiveToken, inactiveToken);
  }
});

test('a changed current policy after arming refuses before issue and releases hooks', async () => {
  const { commander, events } = fixture();
  const failure = new Error('Current policy changed');
  let checks = 0;
  await assert.rejects(
    dispatchBrowserReply(commander, request, {
      receiptMs: 50,
      pollMs: 1,
      inactiveToken: 'reply',
      verifyCurrent: () => {
        if (++checks === 2) {
          throw failure;
        }
      },
    }),
    failure
  );
  assert.deepEqual(events, ['armText', 'release']);
});

test('definite pre-dispatch inactive refusal propagates immediately; a rejected issued click still requires its receipt', async () => {
  for (const dispatched of [false, undefined]) {
    const { commander, events } = fixture();
    const failure = Object.assign(new Error('Click refused'), { dispatched });
    commander.clickButton = async () => {
      throw failure;
    };
    const pending = dispatchBrowserReply(commander, request, {
      receiptMs: 50,
      pollMs: 1,
      inactiveToken: 'reply',
    });
    if (dispatched === false) {
      await assert.rejects(pending, failure);
      assert.deepEqual(events, ['armText', 'release']);
    } else {
      assert.equal((await pending).messageId, 'receipt');
      assert.deepEqual(events, ['armText', 'receipt', 'release']);
    }
  }
});
