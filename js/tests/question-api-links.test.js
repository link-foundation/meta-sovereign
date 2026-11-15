import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { sourceMessageLinkProperties } from '../src/sources/message-text-links.js';
import {
  planAutomation,
  normalizeAutomation,
} from '../src/automation/automations.js';
import { chatQuestionTurn } from '../src/automation/question-chat-turn.js';
import {
  readChatAnswerInput,
  validateAnswerDraft,
} from '../src/automation/question-store.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { startQuestionFixtureServer } from './helpers/question-fixture-server.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  apiLink,
  apiLinkRule,
  apiLinkAutomation,
  apiLinkMessage,
  seedApiLinkStore,
} from '../../experiments/issue-56/question-api-links-fixture.mjs';

const planMessage = (message) =>
  planAutomation([apiLinkRule, message], apiLinkAutomation, {
    self: ['me'],
    targets: [{ source: 'telegram', chat: '7' }],
  });

test('API text, captions, MTProto and actual Desktop imports retain targets in review and frozen history', async () => {
  for (const kind of ['bot', 'caption', 'mtproto', 'archive']) {
    const message = await apiLinkMessage(kind);
    const [draft] = planMessage(message).drafts;
    assert.equal(draft.answer.question, apiLink.question, kind);
    assert.equal(draft.answer.match, 'exact', kind);
    assert.equal(draft.answer.requiresReview, true, kind);
    assert.deepEqual(
      draft.answer.turn.messages[0].links,
      [apiLink.first],
      kind
    );
    assert.deepEqual(
      draft.answer.links ?? draft.answer.parts[0].links,
      [apiLink.first],
      kind
    );
    const store = createMemoryStore();
    await store.put(message);
    assert.equal(
      (await readChatAnswerInput(store, apiLinkAutomation, draft)).ok,
      true,
      kind
    );
    await store.put(await apiLinkMessage(kind, apiLink.second));
    assert.equal(
      (await readChatAnswerInput(store, apiLinkAutomation, draft)).code,
      'answer-changed',
      kind
    );
    assert.equal(
      (
        await validateAnswerDraft(store, apiLinkAutomation, draft, {
          reviewed: true,
        })
      ).code,
      'answer-changed',
      kind
    );
    const invalid = await apiLinkMessage(kind, 'http://');
    assert.equal(invalid.body, apiLink.question, kind);
    assert.equal(planMessage(invalid).drafts.length, 0, kind);
  }
});

test('UTF-16 offsets, source order and repeated full destinations survive without body rewriting', () => {
  const body = '😀 label then label and label';
  const offsets = [3, 14, 24];
  const urls = [apiLink.first, apiLink.second, apiLink.first];
  const message = {
    source: 'telegram',
    body,
    raw: {
      text: body,
      entities: offsets
        .map((offset, i) => ({
          type: 'text_link',
          offset,
          length: 5,
          url: urls[i],
        }))
        .toReversed(),
    },
  };
  assert.deepEqual(sourceMessageLinkProperties(message), { links: urls });
  assert.equal(message.body, body);
  const visible = apiLink.first;
  assert.deepEqual(
    sourceMessageLinkProperties({
      source: 'telegram',
      body: visible,
      raw: {
        text: visible,
        entities: [{ type: 'url', offset: 0, length: visible.length }],
      },
    }),
    { links: [visible] }
  );
});

test('malformed, overlapping, stale and oversized API metadata refuses the whole question turn', async () => {
  const message = await apiLinkMessage();
  const entity = message.raw.entities[0];
  for (const entities of [
    null,
    [null],
    [{ ...entity, offset: -1 }],
    [{ ...entity, offset: 0.5 }],
    [{ ...entity, length: 1000 }],
    [{ ...entity, url: '' }],
    [{ ...entity, url: 'http://' }],
    [entity, entity],
    Array(129).fill({ type: 'bold', offset: 0, length: 1 }),
    [{ ...entity, url: `https://example.test/${'x'.repeat(2000)}` }],
    [{ ...entity, type: 'unknown' }],
  ]) {
    const changed = { ...message, raw: { ...message.raw, entities } };
    assert.deepEqual(sourceMessageLinkProperties(changed), { links: null });
    assert.equal(
      chatQuestionTurn([changed]).reason,
      'question-turn-unavailable'
    );
    assert.equal(planMessage(changed).drafts.length, 0);
  }
  assert.deepEqual(
    sourceMessageLinkProperties({ ...message, body: 'Edited question?' }),
    { links: null }
  );
  assert.deepEqual(
    sourceMessageLinkProperties({ ...message, links: [apiLink.second] }),
    { links: null }
  );
  const emoji = {
    ...message,
    body: '😀?',
    raw: { text: '😀?', entities: [{ ...entity, offset: 1, length: 1 }] },
  };
  assert.equal(chatQuestionTurn([emoji]).reason, 'question-turn-unavailable');
});

test('Desktop segment coherence is checked and unsafe metadata remains an explicit refusal', () => {
  const text = [{ type: 'text_link', text: 'label', href: apiLink.first }];
  const message = {
    source: 'telegram',
    body: 'label',
    raw: { text, text_entities: text },
  };
  assert.deepEqual(sourceMessageLinkProperties(message), {
    links: [apiLink.first],
  });
  for (const raw of [
    { text, text_entities: [{ ...text[0], href: apiLink.second }] },
    { text, text_entities: [{ ...text[0], text: 'other' }] },
    { text: [{ ...text[0], href: null }] },
  ]) {
    assert.deepEqual(sourceMessageLinkProperties({ ...message, raw }), {
      links: null,
    });
  }
  for (const source of ['hh', 'vk', 'email', 'whatsapp']) {
    assert.deepEqual(sourceMessageLinkProperties({ ...message, source }), {});
  }
});

test('legacy reviewed drafts without destination identity cannot bypass a fresh review', async () => {
  const message = await apiLinkMessage();
  const [draft] = planMessage(message).drafts;
  delete draft.answer.turn;
  const store = createMemoryStore();
  await store.put(message);
  assert.equal(
    (
      await validateAnswerDraft(store, apiLinkAutomation, draft, {
        reviewed: true,
      })
    ).code,
    'answer-changed'
  );
});

test('the shared sender refuses concealed API links and preserves ordinary automatic answers', async () => {
  for (const hidden of [true, false]) {
    const store = createMemoryStore();
    await store.put(apiLinkRule);
    const message = await apiLinkMessage();
    if (!hidden) {
      delete message.raw.entities;
    }
    await store.put(message);
    const automation = normalizeAutomation({
      ...apiLinkAutomation,
      pacing: { typing: false },
    });
    await store.put(automation);
    const sent = [];
    const runner = createAutomationRunner({
      store,
      self: ['me'],
      send: async (draft) => {
        sent.push(draft);
        return { status: 'sent', messageId: '2' };
      },
    });
    const plan = await runner.plan(automation, {
      targets: [{ source: 'telegram', chat: '7' }],
    });
    assert.equal(plan.drafts.length, 1);
    assert.equal(plan.drafts[0].answer.requiresReview, hidden);
    const result = await runner.deliverDraft(automation, plan.drafts[0]);
    assert.equal(result.status === 'sent', !hidden);
    assert.equal(sent.length, hidden ? 0 : 1);
    if (hidden) {
      assert.equal(
        (
          await runner.sendDraft(plan.drafts[0].id, {
            confirm: true,
          })
        ).status,
        'sent'
      );
      await assert.rejects(
        runner.sendDraft(plan.drafts[0].id, { confirm: true }),
        /no draft/u
      );
    }
    assert.notEqual(
      (await runner.deliverDraft(automation, plan.drafts[0])).status,
      'sent'
    );
    assert.equal(sent.length, 1);
  }
});

test(
  'foreground CLI and both Lino transports expose actual stored API destinations',
  { timeout: 20000 },
  async () => {
    const store = await seedApiLinkStore();
    const cli = createAutomationCommands({ openStore: async () => store });
    const lines = [];
    assert.equal(
      await cli.automations(
        { _: ['plan', apiLinkAutomation.id], chat: 'telegram:7' },
        (line) => lines.push(line)
      ),
      0
    );
    assert.equal(
      lines.some((line) => line.includes(apiLink.first)),
      true,
      lines.join('\n')
    );
    assert.equal(
      lines.some((line) => line.includes('review required: true')),
      true
    );
    const server = await startQuestionFixtureServer({ store });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/automations/plan`,
          {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire({ automation: apiLinkAutomation }, type),
          }
        );
        assert.equal(response.status, 200);
        const plan = await readWireResponse(response);
        assert.equal(plan.drafts[0].answer.requiresReview, true);
        assert.deepEqual(plan.drafts[0].answer.turn.messages[0].links, [
          apiLink.first,
        ]);
      }
    } finally {
      await server.close();
    }
  }
);
