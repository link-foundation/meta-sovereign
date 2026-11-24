import assert from 'node:assert/strict';
import test from 'node:test';
import { planAutomation } from '../src/automation/automations.js';
import { chatQuestionTurn } from '../src/automation/question-chat-turn.js';
import { learnAnswerRules } from '../src/automation/question-learning.js';
import { validateAnswerDraft } from '../src/automation/question-store.js';
import { sourceMessageLinkProperties } from '../src/sources/message-text-links.js';
import {
  seedWhatsappQuestionLinks,
  whatsappChangedTarget,
  whatsappChat,
  whatsappQuestion,
  whatsappQuestionAutomation,
  whatsappQuestionMessage,
  whatsappQuestionRule,
  whatsappReferralQuestion,
  whatsappTarget,
} from '../../experiments/issue-56/question-whatsapp-links-fixture.mjs';
import {
  assertQuestionLinkDelivery,
  assertQuestionLinkSurfaces,
} from './helpers/question-links-integration.mjs';

const plan = (message) =>
  planAutomation([whatsappQuestionRule, message], whatsappQuestionAutomation, {
    self: ['me'],
    targets: [{ source: 'whatsapp', chat: whatsappChat }],
  });

test('WhatsApp referral destinations remain exact and destination-only edits invalidate review', async () => {
  const message = await whatsappReferralQuestion();
  assert.equal(message.body, whatsappQuestion);
  assert.deepEqual(message.links, [whatsappTarget]);
  const [draft] = plan(message).drafts;
  assert.equal(draft.answer.requiresReview, true);
  assert.deepEqual(draft.answer.turn.messages[0].links, [whatsappTarget]);
  const ad = await whatsappQuestionMessage({
    referral: { source_type: 'ad', source_url: whatsappTarget },
  });
  assert.deepEqual(ad.links, [whatsappTarget]);
  assert.equal(plan(ad).drafts[0].answer.requiresReview, true);
  const store = await seedWhatsappQuestionLinks();
  const validate = () =>
    validateAnswerDraft(store, whatsappQuestionAutomation, draft, {
      reviewed: true,
    });
  assert.equal((await validate()).ok, true);
  await store.put(await whatsappReferralQuestion(whatsappChangedTarget));
  assert.equal((await validate()).code, 'answer-changed');
});

test('existing WhatsApp referral records are read and contradictory evidence refuses planning', async () => {
  const message = await whatsappReferralQuestion();
  const { links: _discarded, ...previous } = message;
  assert.deepEqual(sourceMessageLinkProperties(previous), {
    links: [whatsappTarget],
  });
  for (const conflict of [
    { ...previous, links: [whatsappChangedTarget] },
    { ...previous, body: 'Changed wording?' },
    await whatsappQuestionMessage({ referral: { source_type: 'post' } }),
    await whatsappReferralQuestion('https://user@example.test/private'),
    await whatsappQuestionMessage({ type: 'unknown', body: whatsappQuestion }),
    await whatsappQuestionMessage({
      type: 'image',
      text: { body: whatsappQuestion },
      image: { caption: `Submit the form at ${whatsappTarget}` },
    }),
  ]) {
    assert.deepEqual(sourceMessageLinkProperties(conflict), { links: null });
    assert.equal(
      chatQuestionTurn([conflict]).reason,
      'question-turn-unavailable'
    );
    assert.equal(plan(conflict).drafts.length, 0);
  }
});

test('WhatsApp contact cards retain their bounded websites without becoming plain questions', async () => {
  const message = await whatsappQuestionMessage({
    type: 'contacts',
    contacts: [
      {
        name: { formatted_name: 'Recruiter' },
        urls: [{ url: whatsappTarget }],
      },
      {
        name: { formatted_name: 'Office' },
        urls: [{ url: whatsappChangedTarget }],
      },
    ],
  });
  assert.deepEqual(message.links, [whatsappTarget, whatsappChangedTarget]);
  assert.equal(plan(message).drafts.length, 0);
  const oversized = await whatsappQuestionMessage({
    type: 'contacts',
    contacts: [
      { urls: Array.from({ length: 21 }, () => ({ url: whatsappTarget })) },
    ],
  });
  assert.equal(oversized.links, null);
  const malformed = await whatsappQuestionMessage({
    type: 'contacts',
    contacts: [{ urls: null }],
  });
  assert.equal(malformed.links, null);
});

for (const type of ['image', 'video', 'document']) {
  test(`WhatsApp nested ${type} captions are visible and transport media URLs stay separate`, async () => {
    const url = 'https://example.test/media-download';
    const received = (caption) =>
      whatsappQuestionMessage({ type, [type]: { caption, url } });
    const plain = await received(whatsappQuestion);
    assert.equal(plain.body, whatsappQuestion);
    assert.equal(plain.attachments[0].url, url);
    assert.deepEqual(sourceMessageLinkProperties(plain), {});
    assert.equal(plan(plain).drafts[0].answer.requiresReview, false);
    const additional = `${whatsappQuestion} Please fill out ${whatsappTarget}`;
    const linked = await received(additional);
    assert.equal(linked.body, additional);
    assert.equal(plan(linked).drafts.length, 0);
    const legacy = { ...linked, body: '' };
    assert.deepEqual(sourceMessageLinkProperties(legacy), { links: null });
  });
}

test('WhatsApp linked turns do not become learned rules', async () => {
  const incoming = await whatsappReferralQuestion();
  const outgoing = {
    ...incoming,
    id: 'reply',
    raw: undefined,
    links: undefined,
    sender: 'me',
    outgoing: true,
    body: 'Five years.',
    timestamp: '1795305601',
  };
  assert.deepEqual(learnAnswerRules([incoming, outgoing]), []);
});

test('WhatsApp linked replies require explicit confirmation and ordinary text still sends once', async () => {
  for (const [message, requiresReview] of [
    [await whatsappReferralQuestion(), true],
    [await whatsappQuestionMessage(), false],
  ]) {
    await assertQuestionLinkDelivery({
      message,
      rule: whatsappQuestionRule,
      configuration: whatsappQuestionAutomation,
      requiresReview,
    });
  }
});

test('shared CLI and both Lino formats show the WhatsApp destination', async () => {
  await assertQuestionLinkSurfaces({
    store: await seedWhatsappQuestionLinks(),
    automation: whatsappQuestionAutomation,
    target: whatsappTarget,
    chat: `whatsapp:${whatsappChat}`,
  });
});
