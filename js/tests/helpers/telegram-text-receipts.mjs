// Bounded production send adapter with SDK-shaped receipts and no network I/O.
import { createMemoryStore } from '../../src/storage/universal.js';
import { createDefaultSender } from '../../src/sources/browser-sender.js';
import { sendText, sendError } from '../../src/sources/telegram-send.js';
import { named } from './telegram-fakes.mjs';
import { messageAck } from './telegram-message-ack.mjs';

export const textReceiptFixture = async () => {
  const store = createMemoryStore();
  const calls = [];
  const logs = [];
  for (const chat of ['111', '222', '333']) {
    await store.put({
      id: `msg:telegram:${chat}:1`,
      source: 'telegram',
      chat,
      chatName: `Receipt review ${chat}`,
      chatType: 'personal_chat',
      sender: chat,
      body: 'Please send the reviewed response.',
      timestamp: `2026-01-0${chat[0]}T12:00:00Z`,
      raw: { id: 1 },
    });
    await store.put({
      id: `read:telegram:${chat}`,
      kind: 'read',
      source: 'telegram',
      chat,
      unreadCount: 1,
      unreadTopId: 1,
      inboxMaxId: 0,
    });
  }
  const client = {
    getInputEntity: async (chat) => ({ userId: BigInt(chat) }),
    invoke: async (request) => {
      calls.push(request);
      return request.peer.userId === 333n
        ? messageAck(request, 25)
        : { className: 'Updates', updates: [] };
    },
  };
  const send = createDefaultSender({
    getSource: () => ({
      live: {
        post: (draft) =>
          sendText({
            ...draft,
            peer: draft.chat,
            client,
            Api: { messages: { SendMessage: named('messages.SendMessage') } },
            helpers: {
              readBigIntFromBuffer: (bytes) => bytes.readBigInt64LE(),
            },
            log: (entry) => logs.push(entry),
          })
            .then((parts) => ({
              links: parts.map((part) => ({
                id: `msg:telegram:${draft.chat}:${part.id}`,
                source: 'telegram',
                chat: draft.chat,
                chatType: 'personal_chat',
                sender: 'me',
                body: part.text,
                timestamp: new Date().toISOString(),
                raw: { id: part.id },
              })),
            }))
            .catch((error) => {
              throw sendError(error);
            }),
      },
    }),
  });
  return { store, send, calls, logs };
};
