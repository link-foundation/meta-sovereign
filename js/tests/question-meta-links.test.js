import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { sourceMessageLinkProperties } from '../src/sources/message-text-links.js';
import {
  createFacebookLive,
  facebookConversationsToLinks,
  facebookWebhookToLinks,
} from '../src/sources/facebook.js';
import { planAutomation } from '../src/automation/automations.js';
import { chatQuestionTurn } from '../src/automation/question-chat-turn.js';
import { learnAnswerRules } from '../src/automation/question-learning.js';
import {
  learnSavedAnswers,
  validateAnswerDraft,
} from '../src/automation/question-store.js';
import {
  metaQuestionMessage,
  metaQuestionAutomation,
  metaQuestionRule,
  metaTarget,
  metaChangedTarget,
  metaGraphFixture,
  metaArchiveFixture,
  metaHtmlArchiveFixture,
  metaWebhookFixture,
  seedMetaQuestionLinks,
} from '../../experiments/issue-56/question-meta-links-fixture.mjs';
import {
  assertQuestionLinkDelivery,
  assertQuestionLinkSurfaces,
} from './helpers/question-links-integration.mjs';

const plan = (message) =>
  planAutomation([metaQuestionRule, message], metaQuestionAutomation, {
    self: ['me'],
    targets: [{ source: message.source, chat: message.chat }],
  });

for (const via of [
  'share',
  'cta',
  'webhook',
  'button',
  'archive',
  'instagram',
  'html',
]) {
  test(`${via} destinations hold a text match and a changed target invalidates review`, async () => {
    const message = await metaQuestionMessage(via);
    assert.deepEqual(message.links, [metaTarget]);
    const [draft] = plan(message).drafts;
    assert.equal(draft.answer.match, 'exact');
    assert.equal(draft.answer.requiresReview, true);
    assert.deepEqual(draft.answer.turn.messages[0].links, [metaTarget]);
    const store = createMemoryStore();
    await store.put(message);
    assert.equal(
      (
        await validateAnswerDraft(store, metaQuestionAutomation, draft, {
          reviewed: true,
        })
      ).ok,
      true
    );
    await store.put(await metaQuestionMessage(via, metaChangedTarget));
    assert.equal(
      (
        await validateAnswerDraft(store, metaQuestionAutomation, draft, {
          reviewed: true,
        })
      ).code,
      'answer-changed'
    );
  });
}

test('the standard Graph pull requests and retains its destination fields', async () => {
  const queries = [];
  const live = createFacebookLive({
    baseUrl: 'https://graph.example.test/v22.0',
    token: 'fixture',
    pageId: 'page',
    fetchImpl: async (url) => {
      queries.push(new URL(url));
      return globalThis.Response.json(
        metaGraphFixture({ shares: { data: [{ url: metaTarget }] } })
      );
    },
  });
  const result = await live.pullMessages();
  assert.match(queries[0].searchParams.get('fields'), /shares\{url\}/u);
  assert.match(
    queries[0].searchParams.get('fields'),
    /attachments\{generic_template\}/u
  );
  assert.deepEqual(result.links[0].links, [metaTarget]);
  await live.pullMessages({ fields: 'id' });
  assert.equal(queries[1].searchParams.get('fields'), 'id');
});

test('preserves exact URL order and ignores image previews and postback payloads', async () => {
  const message = facebookWebhookToLinks(
    metaWebhookFixture({
      attachments: [
        { type: 'image', payload: { url: 'https://example.test/photo.jpg' } },
        {
          type: 'template',
          payload: {
            elements: [
              {
                default_action: { type: 'web_url', url: metaTarget },
                buttons: [
                  {
                    type: 'postback',
                    payload: 'https://example.test/postback',
                  },
                  { type: 'web_url', url: metaChangedTarget },
                ],
              },
            ],
          },
        },
        { type: 'post', payload: { url: metaTarget } },
      ],
    })
  )[0];
  assert.deepEqual(message.links, [metaTarget, metaChangedTarget, metaTarget]);
  assert.deepEqual(message.attachments, [
    { kind: 'photo', url: 'https://example.test/photo.jpg' },
  ]);
  const archived = await metaQuestionMessage('html');
  assert.deepEqual(archived.links, [metaTarget]);
  assert.equal(archived.attachments[0].name, 'local.pdf');
  assert.equal(archived.reactions[0].by[0], 'Reader');
});

test('retains incomplete destination evidence and refuses every affected turn', async () => {
  const unavailable = [
    ...facebookConversationsToLinks(metaGraphFixture({ is_unsupported: true })),
    ...facebookConversationsToLinks(
      metaGraphFixture({
        shares: { data: [{ url: metaTarget }], paging: { next: 'next' } },
      })
    ),
    ...facebookConversationsToLinks(
      metaGraphFixture({
        shares: {
          data: Array.from({ length: 21 }, () => ({ url: metaTarget })),
        },
      })
    ),
    ...facebookWebhookToLinks(metaWebhookFixture({ attachments: [null] })),
    ...facebookWebhookToLinks(
      metaWebhookFixture({
        attachments: [
          {
            type: 'ig_post',
            payload: {
              url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=11&opaque=expired',
            },
          },
        ],
      })
    ),
    ...(await metaArchiveFixture({
      share: { share_text: 'Unknown location' },
    })),
    ...(await metaHtmlArchiveFixture(
      '<a href="//example.test/unknown-scheme"></a>'
    )),
  ];
  for (const bad of [
    '',
    'http://',
    'https://example.test/space here',
    'https://user@example.test/destination',
    'javascript:alert(0)',
    `https://example.test/${'x'.repeat(2000)}`,
  ]) {
    unavailable.push(await metaQuestionMessage('share', bad));
  }
  for (const item of unavailable) {
    assert.equal(item.links, null);
    assert.equal(chatQuestionTurn([item]).reason, 'question-turn-unavailable');
    assert.equal(plan(item).drafts.length, 0);
  }
});

test('older stored shares are read and native metadata conflicts refuse review', async () => {
  const archive = await metaQuestionMessage('archive');
  delete archive.links;
  assert.deepEqual(sourceMessageLinkProperties(archive), {
    links: [metaTarget],
  });
  const message = await metaQuestionMessage();
  for (const change of [{ body: 'Edited?' }, { links: [metaChangedTarget] }]) {
    const conflict = { ...message, ...change };
    assert.deepEqual(sourceMessageLinkProperties(conflict), { links: null });
    assert.equal(plan(conflict).drafts.length, 0);
  }
});

test('private structured shares are kept out of pure and archived learning', async () => {
  const incoming = await metaQuestionMessage('webhook');
  const outgoing = {
    id: 'msg:facebook:two',
    source: incoming.source,
    chat: incoming.chat,
    sender: 'me',
    outgoing: true,
    body: 'Yes',
    timestamp: new Date(incoming.timestamp + 1000).toISOString(),
  };
  const store = createMemoryStore();
  await store.putMany([incoming, outgoing]);
  assert.deepEqual(learnAnswerRules([incoming, outgoing]), []);
  assert.deepEqual((await learnSavedAnswers(store)).rules, []);
});

test('ordinary webhook images retain their attachments and existing automatic behavior', async () => {
  const url = 'https://example.test/image.jpg';
  const message = facebookWebhookToLinks(
    metaWebhookFixture({ attachments: [{ type: 'image', payload: { url } }] })
  )[0];
  assert.deepEqual(sourceMessageLinkProperties(message), {});
  assert.deepEqual(message.attachments, [{ kind: 'photo', url }]);
  await assertQuestionLinkDelivery({
    rule: metaQuestionRule,
    configuration: metaQuestionAutomation,
    message,
    requiresReview: false,
  });
});

test('a linked question stays held and sends once after explicit review', async () => {
  await assertQuestionLinkDelivery({
    rule: metaQuestionRule,
    configuration: metaQuestionAutomation,
    message: await metaQuestionMessage(),
    requiresReview: true,
  });
});

test('ordinary HTML archives keep local files and reactions out of question destinations', async () => {
  const [message] = await metaHtmlArchiveFixture('');
  assert.deepEqual(sourceMessageLinkProperties(message), {});
  assert.equal(message.attachments[0].name, 'local.pdf');
  assert.equal(message.reactions[0].by[0], 'Reader');
  assert.equal(plan(message).drafts[0].answer.requiresReview, false);
});

test('shared CLI plus text/binary Lino expose the literal Meta destination', async () => {
  await assertQuestionLinkSurfaces({
    store: await seedMetaQuestionLinks(),
    automation: metaQuestionAutomation,
    target: metaTarget,
    chat: 'facebook:7',
  });
});
