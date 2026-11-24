import {
  facebookConversationsToLinks,
  facebookSource,
  facebookWebhookToLinks,
} from '../../js/src/sources/facebook.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { normalizeAutomation } from '../../js/src/automation/automations.js';

export const metaQuestion = 'Do you have experience?';
export const metaTarget = 'https://example.test/assignment?revision=One#Review';
export const metaChangedTarget = metaTarget.replace('One', 'Two');
const timestamp = 1795305600000;
export const metaQuestionRule = {
  id: 'qa-rule:meta-links',
  question: metaQuestion,
  answers: [{ text: 'Yes', approved: true }],
};
export const metaQuestionAutomation = normalizeAutomation({
  id: 'automation:meta-links',
  name: 'Messenger attachment review',
  mode: 'auto',
  action: { kind: 'answer-questions' },
  conditions: { mutual: false, cooldownDays: 0 },
  pacing: { typing: false },
});

const page = { id: 'page' };
const sender = { id: '7' };

export const metaGraphFixture = (fields) => ({
  data: [
    {
      id: '7',
      messages: {
        data: [
          {
            id: 'one',
            from: sender,
            created_time: new Date(timestamp).toISOString(),
            message: metaQuestion,
            ...fields,
          },
        ],
      },
    },
  ],
});

export const metaWebhookFixture = (fields) => ({
  object: 'page',
  entry: [
    {
      id: page.id,
      messaging: [
        {
          sender,
          recipient: page,
          timestamp,
          message: { mid: 'one', text: metaQuestion, ...fields },
        },
      ],
    },
  ],
});

const archiveContext = (folder = '') => ({
  entryName: `${folder}messages/inbox/7/message_1.json`,
});

export const metaArchiveFixture = (fields, folder) =>
  facebookSource.parseArchive(
    {
      messages: [
        {
          timestamp_ms: timestamp,
          sender_name: '7',
          content: metaQuestion,
          ...fields,
        },
      ],
    },
    archiveContext(folder)
  );

export const metaHtmlArchiveFixture = (anchor) =>
  facebookSource.parseArchive(
    `<title>Messages</title><div class="_a6-g">
      <div class="_a6-h">7</div>
      <div class="_a6-p">${metaQuestion}${anchor}
        <ul class="_a6-q"><li>👍 <a href="https://example.test/profile">Reader</a></li></ul>
        <a href="files/local.pdf"></a>
      </div>
      <div class="_a6-o">Nov 22, 2026 12:00:00 pm</div>
    </div>`,
    archiveContext('instagram/')
  );

export const metaQuestionMessage = async (via = 'share', url = metaTarget) => {
  if (via === 'archive' || via === 'instagram') {
    return (
      await metaArchiveFixture(
        { share: { link: url, share_text: 'Instructions' } },
        via === 'instagram' ? 'instagram/' : ''
      )
    )[0];
  }
  if (via === 'html') {
    return (await metaHtmlArchiveFixture(`<a href="${url}"></a>`))[0];
  }
  if (via === 'webhook') {
    return facebookWebhookToLinks(
      metaWebhookFixture({ attachments: [{ type: 'share', payload: { url } }] })
    )[0];
  }
  if (via === 'button') {
    return facebookWebhookToLinks(
      metaWebhookFixture({
        attachments: [
          {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: [
                {
                  title: 'Instructions',
                  image_url: 'https://example.test/image.jpg',
                  buttons: [{ type: 'web_url', url, title: 'Open' }],
                },
              ],
            },
          },
        ],
      })
    )[0];
  }
  if (via === 'cta') {
    return facebookConversationsToLinks(
      metaGraphFixture({
        attachments: {
          data: [{ generic_template: { cta: { type: 'web_url', url } } }],
        },
      })
    )[0];
  }
  return facebookConversationsToLinks(
    metaGraphFixture({ shares: { data: [{ url }] } })
  )[0];
};

export const seedMetaQuestionLinks = async () => {
  const store = createMemoryStore();
  await store.putMany([
    metaQuestionRule,
    metaQuestionAutomation,
    await metaQuestionMessage(),
  ]);
  return store;
};
