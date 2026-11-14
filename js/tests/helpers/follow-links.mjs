import { createMemoryStore } from '../../src/storage/universal.js';

export const followLinksFixture = async () => {
  const store = createMemoryStore();
  const messages = [
    {
      source: 'vk',
      chat: '2000000001',
      sender: 'friend',
      body: 'Join https://t.me/Study_Group or https://t.me/joinchat/AbCd_123-xyz.',
    },
    {
      source: 'telegram',
      chat: '-10022',
      sender: 'person',
      body: 'Read https://t.me/c/12345/7',
      attachments: [{ kind: 'link', url: 'https://telegram.me/study_group' }],
    },
    {
      source: 'vk',
      chat: '2000000001',
      sender: 'me',
      body: 'https://t.me/ExcludedSelf',
    },
    {
      source: 'vk',
      chat: '2000000001',
      sender: '42',
      body: 'https://t.me/ExcludedRaw',
      raw: { out: 1 },
    },
    {
      source: 'telegram',
      chat: '-10022',
      sender: '42',
      body: 'https://t.me/ExcludedOutgoing',
      outgoing: true,
    },
  ].map((message, i) => ({
    id: `msg:${message.source}:${message.chat}:${i + 1}`,
    timestamp: '2026-11-10T00:00:00Z',
    ...message,
  }));
  await store.putMany(messages);
  await store.put({
    id: 'secret:follow-fixture',
    tokens: ['secret'],
    body: 'https://t.me/SecretRecord',
  });
  return { store, messages };
};
