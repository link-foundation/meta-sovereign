import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { sourceMessageLinkProperties } from '../src/sources/message-text-links.js';
import { planAutomation } from '../src/automation/automations.js';
import { chatQuestionTurn } from '../src/automation/question-chat-turn.js';
import {
  readChatAnswerInput,
  validateAnswerDraft,
  learnSavedAnswers,
} from '../src/automation/question-store.js';
import { learnAnswerRules } from '../src/automation/question-learning.js';
import {
  assertQuestionLinkDelivery,
  assertQuestionLinkSurfaces,
} from './helpers/question-links-integration.mjs';
import {
  vkQuestionLink,
  vkQuestionRule,
  vkQuestionAutomation,
  vkQuestionMessage,
  seedVkQuestionLinks,
} from '../../experiments/issue-56/question-vk-links-fixture.mjs';

const plan = (message) =>
  planAutomation([vkQuestionRule, message], vkQuestionAutomation, {
    self: ['me'],
    targets: [{ source: 'vk', chat: '7' }],
  });

for (const via of ['message', 'history', 'conversations', 'archive']) {
  for (const type of ['link', 'doc', 'wall']) {
    test(`${via} preserves ${type} destinations in review and frozen history`, async () => {
      const message = await vkQuestionMessage({ via, type });
      const target =
        type === 'wall' ? 'https://vk.com/wall-9_3' : vkQuestionLink.first;
      const [draft] = plan(message).drafts;
      assert.equal(draft.answer.match, 'exact');
      assert.equal(draft.answer.requiresReview, true);
      assert.deepEqual(draft.answer.turn.messages[0].links, [target]);
      assert.deepEqual(draft.answer.links ?? draft.answer.parts[0].links, [
        target,
      ]);
      const store = createMemoryStore();
      await store.put(message);
      assert.equal(
        (await readChatAnswerInput(store, vkQuestionAutomation, draft)).ok,
        true
      );
      const changed = await vkQuestionMessage({
        via,
        type,
        url: vkQuestionLink.second,
      });
      if (type === 'wall') {
        changed.raw.attachments[0].wall.id = 4;
        changed.attachments[0].url = 'https://vk.com/wall-9_4';
      }
      await store.put(changed);
      assert.equal(
        (
          await validateAnswerDraft(store, vkQuestionAutomation, draft, {
            reviewed: true,
          })
        ).code,
        'answer-changed'
      );
    });
  }
}

test('native and normalized destinations retain order, repetition and full URL bytes', async () => {
  const message = await vkQuestionMessage();
  const urls = [
    vkQuestionLink.first,
    vkQuestionLink.second,
    vkQuestionLink.first,
  ];
  message.raw.attachments = urls.map((url) => ({
    type: 'link',
    link: { url },
  }));
  message.attachments = urls.map((url) => ({ kind: 'link', url }));
  assert.deepEqual(sourceMessageLinkProperties(message), { links: urls });
  delete message.raw;
  assert.deepEqual(sourceMessageLinkProperties(message), { links: urls });
  assert.equal(message.body, vkQuestionLink.question);
});

test('actual native Unix dates and adapter null collections work across all four VK paths', async () => {
  for (const via of ['message', 'history', 'conversations', 'archive']) {
    for (const type of ['link', 'doc', 'wall']) {
      const linked = await vkQuestionMessage({ via, type, nativeTime: true });
      assert.equal(plan(linked).drafts[0].answer.requiresReview, true);
      linked.raw.attachments = [];
      linked.attachments = null;
      assert.deepEqual(sourceMessageLinkProperties(linked), {});
      assert.equal(plan(linked).drafts[0].answer.requiresReview, false);
    }
  }
});

test('pure and archive learning exclude private or unverified native destinations before projecting raw data', async () => {
  for (const type of ['link', 'doc']) {
    // ISO dates isolate destination privacy from the independent native-time defect.
    const incoming = await vkQuestionMessage({ type });
    const outgoing = {
      ...incoming,
      id: 'msg:vk:7:2',
      sender: 'me',
      body: 'Yes',
      timestamp: new Date(Date.parse(incoming.timestamp) + 1000).toISOString(),
      raw: undefined,
      attachments: null,
    };
    for (const message of [
      incoming,
      { ...incoming, links: [vkQuestionLink.second] },
    ]) {
      assert.deepEqual(learnAnswerRules([message, outgoing]), []);
      const store = createMemoryStore();
      await store.putMany([outgoing, message]);
      assert.deepEqual((await learnSavedAnswers(store)).rules, []);
    }
  }
});

test('malformed, stale, conflicting and oversized VK metadata refuses the question turn', async () => {
  const message = await vkQuestionMessage();
  for (const attachments of [
    null,
    [null],
    [[]],
    [true],
    [{ type: 'link' }],
    [{ type: 'doc', doc: {} }],
    [{ type: 'wall', wall: {} }],
    [{ type: 'link', link: { url: 'http://' } }],
    [{ type: 'link', link: { url: '' } }],
    [
      {
        type: 'link',
        link: { url: `https://example.test/${'x'.repeat(2000)}` },
      },
    ],
    Array(129).fill({ type: 'photo' }),
    Array(21).fill(message.raw.attachments[0]),
  ]) {
    const changed = { ...message, raw: { ...message.raw, attachments } };
    assert.deepEqual(sourceMessageLinkProperties(changed), { links: null });
    assert.equal(
      chatQuestionTurn([changed]).reason,
      'question-turn-unavailable'
    );
    assert.equal(plan(changed).drafts.length, 0);
  }
  for (const changed of [
    { ...message, body: 'Edited question?' },
    { ...message, links: [vkQuestionLink.second] },
    { ...message, attachments: [{ kind: 'link', url: vkQuestionLink.second }] },
  ]) {
    assert.deepEqual(sourceMessageLinkProperties(changed), { links: null });
  }
  const canonical = {
    ...message,
    raw: undefined,
    attachments: [{ kind: 'link', url: null }],
  };
  assert.deepEqual(sourceMessageLinkProperties(canonical), { links: null });
});

test('ordinary text, media thumbnails and foreign metadata retain existing behavior', async () => {
  const message = await vkQuestionMessage();
  for (const raw of [
    undefined,
    { text: message.body },
    { text: message.body, attachments: [] },
    {
      text: message.body,
      attachments: [
        { type: 'photo', photo: { sizes: [{ url: vkQuestionLink.first }] } },
      ],
    },
  ]) {
    const ordinary = { ...message, attachments: undefined, raw };
    assert.deepEqual(sourceMessageLinkProperties(ordinary), {});
    assert.equal(plan(ordinary).drafts[0].answer.requiresReview, false);
  }
  for (const source of ['hh', 'whatsapp', 'email', 'telegram']) {
    assert.deepEqual(sourceMessageLinkProperties({ ...message, source }), {});
  }
});

test('reviewed legacy drafts cannot omit the VK destination identity', async () => {
  const message = await vkQuestionMessage();
  const [draft] = plan(message).drafts;
  delete draft.answer.turn;
  const store = createMemoryStore();
  await store.put(message);
  assert.equal(
    (
      await validateAnswerDraft(store, vkQuestionAutomation, draft, {
        reviewed: true,
      })
    ).code,
    'answer-changed'
  );
});

test('actual shared delivery blocks concealed VK targets until explicit review, retaining deduplication', async () => {
  for (const hidden of [true, false]) {
    const message = await vkQuestionMessage();
    if (!hidden) {
      delete message.raw.attachments;
      delete message.attachments;
    }
    await assertQuestionLinkDelivery({
      message,
      rule: vkQuestionRule,
      configuration: vkQuestionAutomation,
      requiresReview: hidden,
    });
  }
});

test(
  'foreground CLI and both Lino transports expose VK attachment destinations',
  { timeout: 20000 },
  async () => {
    await assertQuestionLinkSurfaces({
      store: await seedVkQuestionLinks(),
      automation: vkQuestionAutomation,
      target: vkQuestionLink.first,
      chat: 'vk:7',
    });
  }
);
