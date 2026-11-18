import test from 'node:test';
import assert from 'node:assert/strict';
import { browserMessageState } from '../src/sources/browser-message-state.js';
import { matchingChoiceReplies } from '../src/sources/browser-choice-controller.js';
import { toBrowserMessageLink } from '../src/sources/browser-message.js';

const spec = {
  outgoing: '.own',
  delivery: {
    pending: '.pending',
    failed: '.failed',
    sent: '.sent',
    read: '.read',
  },
};
const node = (selectors) => ({
  matches: (selector) => selectors.includes(selector),
  querySelector: () => null,
});

test('native outgoing direction never substitutes for a positive delivery state', () => {
  assert.deepEqual(browserMessageState(spec, node([])), {
    outgoing: false,
    delivery: null,
  });
  assert.deepEqual(browserMessageState(spec, node(['.own'])), {
    outgoing: true,
    delivery: 'unknown',
  });
  for (const state of ['pending', 'failed', 'sent', 'read']) {
    assert.equal(
      browserMessageState(spec, node(['.own', `.${state}`])).delivery,
      state
    );
  }
  assert.equal(
    browserMessageState(spec, node(['.own', '.failed', '.sent'])).delivery,
    'unknown'
  );
  assert.deepEqual(browserMessageState({ outgoing: '.own' }, node(['.own'])), {
    outgoing: true,
  });
});

test('delivery observations survive normalization and uncertain bubbles cannot confirm sends', () => {
  const input = {
    expected: { chat: '7', question: { id: '101' } },
    text: 'Yes.',
  };
  const attempt = { before: ['101'] };
  for (const delivery of [
    'pending',
    'failed',
    'unknown',
    null,
    'sent',
    'delivered',
    'read',
  ]) {
    const row = { id: '102', body: 'Yes.', outgoing: true, delivery };
    assert.equal(toBrowserMessageLink('hh', '7', row).delivery, delivery);
    const current = { chat: '7', messages: [{ id: '101' }, row] };
    assert.equal(
      matchingChoiceReplies(input, current, attempt).length,
      ['sent', 'delivered', 'read'].includes(delivery) ? 1 : 0
    );
  }
});
