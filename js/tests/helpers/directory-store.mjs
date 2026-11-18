import { createMemoryStore } from '../../src/storage/universal.js';

export const directoryStore = async () => {
  const store = createMemoryStore();
  const at = Date.now();
  await store.putMany(
    Array.from({ length: 150 }, (_, index) => ({
      id: `msg:telegram:${index + 1}:1`,
      source: 'telegram',
      chat: String(index + 1),
      sender: String(index + 1),
      senderName: `Contact ${index + 1}`,
      chatName: `Contact ${index + 1}`,
      chatType: 'personal_chat',
      body: `Cached conversation ${index + 1}`,
      timestamp: new Date(at - index * 60_000).toISOString(),
    }))
  );
  return store;
};
