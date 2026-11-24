import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserSender } from '../src/sources/browser-sender.js';
import {
  textReplyExpected,
  textReplyBody,
} from '../../experiments/issue-56/text-reply-fixture.mjs';

test('frozen text replies are available while generic automated HH sends are refused', async () => {
  let opened = 0;
  const sender = createBrowserSender({
    openSession: () => {
      opened++;
      throw new Error('Unexpected launch');
    },
  });
  assert.equal(typeof sender.replyText, 'function');
  await assert.rejects(
    sender.send({
      source: 'hh',
      chat: '7',
      text: textReplyBody,
      automated: true,
    }),
    { code: 'answer-choice-required' }
  );
  await assert.rejects(
    sender.replyText({ source: 'hh', chat: '7', text: textReplyBody }),
    { code: 'bad-draft' }
  );
  await sender.close();
  await assert.rejects(
    sender.replyText({
      source: 'hh',
      chat: '7',
      text: textReplyBody,
      expected: textReplyExpected(),
    }),
    { code: 'answer-text-unavailable' }
  );
  assert.equal(opened, 0);
});
