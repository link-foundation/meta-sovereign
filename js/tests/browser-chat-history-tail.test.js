import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  browserHistoryTailWitness,
  claimBrowserHistoryTail,
  verifyBrowserHistoryTransition,
} from '../src/sources/browser-chat-history-tail.js';
import { inactiveViewFixture } from '../../experiments/issue-56/inactive-view-fixture.mjs';

const setup = () => {
  const view = inactiveViewFixture();
  const page = new EventEmitter();
  const frame = {
    evaluate: (fn, input) =>
      Promise.resolve(view.evaluate({ fn, args: [input] })),
  };
  const bindings = [
    { frame, key: 'original', url: 'https://hh.ru/chat/7', length: 2 },
  ];
  return { view, page, bindings };
};
const initial = { index: 1, ids: [11, 12] };
const restored = { index: 1, ids: [11, 12, 13, 14] };
const remember = async ({ page, bindings }) => {
  const claim = await claimBrowserHistoryTail(page, bindings, initial);
  bindings[0].length = 4;
  await claim.retain(restored);
  await claim.release();
};

test('native history transitions retain the complete owner prefix and allow only one new push', () => {
  assert.equal(
    verifyBrowserHistoryTransition(initial, { index: 2, ids: [11, 12, 13] }),
    true
  );
  assert.equal(
    verifyBrowserHistoryTransition(restored, { index: 2, ids: [11, 12, 15] }),
    true
  );
  assert.equal(verifyBrowserHistoryTransition(initial, restored, true), true);
  for (const after of [
    { index: 2, ids: [10, 12, 13] },
    { index: 3, ids: [11, 12, 13, 14] },
    { index: 2, ids: [11, 12, 13, 14] },
    { index: 2, ids: [11, 12, 14] },
    { index: 0, ids: [11, 12] },
  ]) {
    assert.equal(verifyBrowserHistoryTransition(restored, after), false);
  }
});

test('only exact retained native IDs and unchanged document bindings admit an owned suffix', async () => {
  const context = setup();
  await remember(context);
  assert.equal(context.view.listeners(), 8);
  const claim = await claimBrowserHistoryTail(
    context.page,
    context.bindings,
    restored
  );
  assert.equal(claim.reused, true);
  await claim.release();
  assert.equal(context.view.listeners(), 0);
  assert.equal(context.page.eventNames().length, 0);
  await assert.rejects(
    claimBrowserHistoryTail(context.page, context.bindings, restored),
    { code: 'browser-chat-view-history-forward' }
  );
});

test('owner activity between passes permanently revokes the suffix even after leaving again', async () => {
  for (const event of ['focus', 'input', 'wheel']) {
    const context = setup();
    await remember(context);
    if (event === 'focus') {
      context.view.focus(true);
      context.view.focus(false);
    } else {
      context.view.document.emit(event, event !== 'input');
    }
    await assert.rejects(
      claimBrowserHistoryTail(context.page, context.bindings, restored),
      { code: 'browser-chat-view-history-forward' }
    );
    assert.equal(context.view.listeners(), 0);
  }
});

test('entry substitution, replaced documents and intervening navigation never inherit a proof', async () => {
  for (const change of [
    'ids',
    'document',
    'framenavigated',
    'framedetached',
    'close',
  ]) {
    const context = setup();
    await remember(context);
    let position = restored;
    if (change === 'ids') {
      position = { index: 1, ids: [11, 12, 13, 99] };
    } else if (change === 'document') {
      context.bindings[0].key = 'replacement';
    } else {
      context.page.emit(change);
    }
    await assert.rejects(
      claimBrowserHistoryTail(context.page, context.bindings, position),
      { code: 'browser-chat-view-history-forward' }
    );
    assert.equal(context.view.listeners(), 0);
    assert.equal(context.page.eventNames().length, 0);
  }
});

test('only the exact current owned input and native filter activation avoid revocation', () => {
  const view = inactiveViewFixture();
  const call = (operation) =>
    view.evaluate({
      fn: browserHistoryTailWitness,
      args: [{ operation, token: 'test' }],
    });
  assert.equal(call('open'), true);
  const field = {},
    event = { type: 'input', isTrusted: false, target: field };
  const inactive = { ownedInput: event };
  view.window[Symbol.for('meta-sovereign.browser-inactive-view.v1')] = inactive;
  view.document.emit('input', false, event);
  assert.equal(call('status'), true);
  inactive.ownedFilterControl = field;
  view.document.emit('input', true, {
    type: 'input',
    isTrusted: true,
    target: field,
  });
  assert.equal(call('status'), true);
  delete inactive.ownedInput;
  delete inactive.ownedFilterControl;
  view.document.emit('input', false, event);
  assert.equal(call('status'), false);
  call('release');
  assert.equal(view.listeners(), 0);
});

test('capacity refusal and partial admission drain every witness without retaining permission', async () => {
  const context = setup();
  await assert.rejects(
    claimBrowserHistoryTail(context.page, context.bindings, {
      index: 48,
      ids: Array.from({ length: 49 }, (_, i) => i),
    }),
    { code: 'browser-chat-view-history-capacity' }
  );
  assert.equal(context.view.listeners(), 0);
  const closed = {
    frame: {
      evaluate: async () => {
        throw new Error('Closed frame');
      },
    },
  };
  await assert.rejects(
    claimBrowserHistoryTail(
      context.page,
      [...context.bindings, closed],
      initial
    ),
    /Closed frame/
  );
  assert.equal(context.view.listeners(), 0);
  assert.equal(context.page.eventNames().length, 0);
});

test('a pass without forward entries retains no event hooks or reusable permission', async () => {
  const context = setup();
  const claim = await claimBrowserHistoryTail(
    context.page,
    context.bindings,
    initial
  );
  assert.equal(claim.reused, false);
  await claim.retain(initial);
  await claim.release();
  assert.equal(context.view.listeners(), 0);
  assert.equal(context.page.eventNames().length, 0);
});
