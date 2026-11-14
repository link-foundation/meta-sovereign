import test from 'node:test';
import assert from 'node:assert/strict';
import { hhWebChatId, hhWebChatUrl } from '../src/sources/hh-web-ui.js';
import { createBrowserSender, WEB_UIS } from '../src/sources/browser-sender.js';
import { resolveBrowserChoiceDocument } from '../src/sources/browser-choice-document.js';
import { providerChoiceDraft } from '../../experiments/issue-56/provider-choice-fixture.mjs';
import { selectBrowserAnswer } from '../src/sources/browser-choices.js';

test('HH web references retain explicit numeric identity without mapping API UUIDs', () => {
  for (const value of [
    '7',
    7,
    'https://hh.ru/chat/7',
    'https://chatik.hh.ru/chat/7/',
  ]) {
    assert.equal(hhWebChatId(value), '7');
  }
  for (const value of [
    'chat:123',
    'c8e9-uuid',
    '',
    null,
    'https://hh.ru.evil.test/chat/7',
    'https://evil.test/?https://hh.ru/chat/7',
    'https://owner@hh.ru/chat/7',
    'https://hh.ru/chat/7/other',
  ]) {
    assert.throws(() => hhWebChatId(value), {
      code: 'unsupported-target',
      fallback: false,
    });
  }
});

test('HH application pages require an official host and retain the intended chat', () => {
  assert.equal(hhWebChatUrl('7'), 'https://hh.ru/chat/7');
  assert.equal(
    hhWebChatUrl('7', { browserUrl: 'https://hh.ru/vacancy/42' }),
    'https://hh.ru/vacancy/42'
  );
  for (const browserUrl of [
    'https://hh.ru/chat/8',
    'https://hh.ru.evil.test/vacancy/42',
    'https://chatik.hh.ru/chat/7',
    'file:///chat/7',
    'https://owner@hh.ru/chat/7',
  ]) {
    assert.throws(() => hhWebChatUrl('7', { browserUrl }), {
      code: 'unsupported-target',
    });
  }
});

test('built-in HH refuses unidentified or unsupported text writes before launching', async () => {
  let opened = 0;
  const sender = createBrowserSender({
    openSession: () => {
      opened++;
      throw new Error('Unexpected browser launch');
    },
  });
  await assert.rejects(
    sender.chooseAnswer({ ...providerChoiceDraft(), chat: 'chat:uuid' }),
    { code: 'unsupported-target' }
  );
  await assert.rejects(
    sender.chooseAnswer({
      ...providerChoiceDraft(),
      browserUrl: 'https://hh.ru/chat/8',
    }),
    { code: 'unsupported-target' }
  );
  await assert.rejects(
    sender.send({ source: 'hh', chat: '7', text: 'Unreviewed' }),
    { code: 'answer-choice-required' }
  );
  await assert.rejects(sender.setTyping({ source: 'hh', chat: '7' }), {
    code: 'unsupported',
  });
  assert.equal(opened, 0);
  await sender.close();
});

test('HH document selection requires a connected trusted frame context', async () => {
  const commander = {
    evaluate: () => {
      throw new Error('Unexpected page access');
    },
  };
  await assert.rejects(
    resolveBrowserChoiceDocument(commander, null, WEB_UIS.hh, '7'),
    { code: 'answer-chat-unverified', fallback: false }
  );
  assert.equal(
    await resolveBrowserChoiceDocument(commander, null, WEB_UIS.vk, '7'),
    commander
  );
});

test('a lost document check during arming still releases temporary event guards', async () => {
  const operations = [];
  const commander = {
    evaluate: ({ args: [input] }) => {
      operations.push(input.operation);
      if (input.operation === 'arm') {
        throw Object.assign(new Error('Owner navigated during arming'), {
          code: 'answer-chat-unverified',
        });
      }
      return { released: true };
    },
    clickButton: () => {
      throw new Error('Unexpected click');
    },
  };
  await assert.rejects(
    selectBrowserAnswer(commander, WEB_UIS.hh, providerChoiceDraft(), '7'),
    { code: 'answer-chat-unverified' }
  );
  assert.deepEqual(operations, ['arm', 'release']);
});
