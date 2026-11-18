import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSender } from '../src/sources/browser-sender.js';
import { HH_WEB_UI } from '../src/sources/hh-web-ui.js';
import {
  checkedTextReply,
  sendBrowserTextReply,
  createBrowserTextActions,
} from '../src/sources/browser-text-reply.js';
import {
  textReplyExpected,
  textReplyBody,
} from '../../experiments/issue-56/text-reply-fixture.mjs';

test('text replies require bounded text, an incoming whole turn and explicit native capability', async () => {
  const frozen = checkedTextReply(
    HH_WEB_UI,
    '7',
    textReplyExpected(),
    textReplyBody
  );
  assert.deepEqual(
    checkedTextReply(HH_WEB_UI, '7', frozen, textReplyBody),
    frozen
  );
  const mutations = [
    (value) => {
      value.chat = '8';
    },
    (value) => {
      value.question.outgoing = true;
    },
    (value) => {
      delete value.pendingTurn;
    },
    (value) => {
      value.pendingTurn.messages[0].body = 'Changed';
    },
    (value) => {
      value.strictOptions = true;
    },
    (value) => {
      value.answerOptions = ['Yes'];
    },
    (value) => {
      value.question.body = 'Choose one option';
      value.pendingTurn.messages[0].body = value.question.body;
    },
  ];
  for (const mutate of mutations) {
    const expected = textReplyExpected();
    mutate(expected);
    assert.throws(
      () => checkedTextReply(HH_WEB_UI, '7', expected, textReplyBody),
      { code: 'bad-draft' }
    );
  }
  for (const text of ['', ' ', null, 'x'.repeat(12001)]) {
    assert.throws(
      () => checkedTextReply(HH_WEB_UI, '7', textReplyExpected(), text),
      { code: 'bad-draft' }
    );
  }
  assert.throws(
    () =>
      checkedTextReply(
        { ...HH_WEB_UI, textReply: null },
        '7',
        textReplyExpected(),
        textReplyBody
      ),
    { code: 'answer-text-unavailable' }
  );
  for (const receiptMs of [-1, Infinity, 30001]) {
    await assert.rejects(
      sendBrowserTextReply(
        { evaluate: () => assert.fail('Unexpected page access') },
        HH_WEB_UI,
        '7',
        textReplyExpected(),
        textReplyBody,
        { receiptMs }
      ),
      { code: 'bad-draft' }
    );
  }
});

test('the shared default facade preserves explicit frozen text intent without API or ordinary send', async () => {
  const writes = [];
  const send = createDefaultSender({
    getSource: () => ({ live: { post: () => assert.fail('Unexpected API') } }),
    browser: {
      send: () => assert.fail('Unexpected plain text'),
      replyText: (value) => writes.push(value),
      close() {},
    },
  });
  const request = {
    source: 'hh',
    chat: '7',
    expected: textReplyExpected(),
    text: textReplyBody,
  };
  await send.replyText(request);
  assert.deepEqual(writes, [request]);
  await send.close();
});

test('shutdown cancels queued text admission and drains it before returning', async () => {
  let drained = false;
  const actions = createBrowserTextActions({
    uiFor: () => HH_WEB_UI,
    inChat: (_source, _target, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => {
          drained = true;
          reject(Object.assign(new Error('Cancelled'), { code: 'cancelled' }));
        })
      ),
  });
  const pending = actions.replyText({
    source: 'hh',
    chat: '7',
    expected: textReplyExpected(),
    text: textReplyBody,
  });
  const rejected = assert.rejects(pending, { code: 'cancelled' });
  await actions.closeTextReplies();
  await rejected;
  assert.equal(drained, true);
});
