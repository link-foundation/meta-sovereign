import {
  telegramSource,
  telegramUpdatesToLinks,
} from '../../js/src/sources/telegram.js';
import { buildMessageLink } from '../../js/src/sources/link.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { normalizeAutomation } from '../../js/src/automation/automations.js';

export const apiLink = {
  question: 'Do you have experience?',
  first: 'https://example.test/assignment?revision=One#Review',
  second: 'https://example.test/assignment?revision=Two#Review',
};
export const apiLinkRule = {
  id: 'qa-rule:api-links',
  question: apiLink.question,
  answers: [{ text: 'Yes', approved: true }],
};
export const apiLinkAutomation = {
  id: 'automation:api-links',
  name: 'API link review',
  mode: 'auto',
  action: { kind: 'answer-questions' },
  conditions: { mutual: false, cooldownDays: 0 },
};

export const seedApiLinkStore = async () => {
  const store = createMemoryStore();
  for (const record of [
    apiLinkRule,
    await apiLinkMessage(),
    normalizeAutomation(apiLinkAutomation),
  ]) {
    await store.put(record);
  }
  return store;
};

/** Actual import adapters, plus the stored MTProto shape, without live accounts. */
export const apiLinkMessage = async (kind = 'bot', target = apiLink.first) => {
  const timestamp = '2026-11-15T00:00:00Z';
  const offset = apiLink.question.indexOf('experience');
  const entity = { type: 'text_link', offset, length: 10, url: target };
  if (kind === 'archive') {
    const [message] = await telegramSource.parseArchive({
      id: 7,
      type: 'personal_chat',
      messages: [
        {
          id: 1,
          type: 'message',
          from_id: 'user8',
          date: timestamp,
          text: [
            'Do you have ',
            { type: 'text_link', text: 'experience', href: target },
            '?',
          ],
        },
      ],
    });
    return message;
  }
  if (kind === 'mtproto') {
    return buildMessageLink({
      source: 'telegram',
      externalId: '1',
      sender: '8',
      chat: '7',
      body: apiLink.question,
      timestamp,
      raw: {
        message: apiLink.question,
        entities: [
          {
            className: 'MessageEntityTextUrl',
            offset,
            length: 10,
            url: target,
          },
        ],
      },
    });
  }
  const [message] = telegramUpdatesToLinks([
    {
      update_id: 1,
      message: {
        message_id: 1,
        date: Date.parse(timestamp) / 1000,
        chat: { id: 7, type: 'private' },
        from: { id: 8 },
        ...(kind === 'caption'
          ? { caption: apiLink.question, caption_entities: [entity] }
          : { text: apiLink.question, entities: [entity] }),
      },
    },
  ]);
  return message;
};
