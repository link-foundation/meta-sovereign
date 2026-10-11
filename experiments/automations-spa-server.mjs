// Issue #31 / PR #34: serve the SPA with a seeded store so the
// Automations screen and the chat's automation menu can be exercised in
// a browser. Sending and typing go to fakes that only log, so nothing
// leaves the machine and the scheduler is off.
//
//   node experiments/automations-spa-server.mjs [port]
import { createMemoryStore } from '../js/src/storage/index.js';
import { buildMessageLink } from '../js/src/sources/link.js';
import { startServer } from '../js/src/server/index.js';
import { DAY_MS } from '../js/src/crm/reengage.js';

const port = Number(process.argv[2] ?? 4791);
const ago = (n) => new Date(Date.now() - n * DAY_MS).toISOString();
const store = createMemoryStore();
let id = 0;
const rows = [
  [
    'telegram',
    'user1001',
    'me',
    'Привет! Как ты? Давно не виделись',
    140,
    'personal_chat',
    'Аня',
  ],
  [
    'telegram',
    'user1001',
    'user1001',
    'Привет, всё хорошо, а у тебя?',
    139,
    'personal_chat',
    'Аня',
  ],
  [
    'vk',
    '2002',
    'me',
    'Здравствуйте, Иван Петрович. Вы сможете посмотреть документ?',
    210,
    null,
    null,
  ],
  ['vk', '2002', '2002', 'Добрый день, да, посмотрю', 209, null, null],
  [
    'email',
    'oleg@example.org',
    'me',
    'Олег, напиши, когда будет время',
    400,
    null,
    null,
  ],
  [
    'email',
    'oleg@example.org',
    'oleg@example.org',
    'Хорошо, напишу',
    395,
    null,
    null,
  ],
  ['vk', '2003', 'me', 'Привет', 3, null, null],
  ['vk', '2003', '2003', 'Привет!', 3, null, null],
];
for (const [source, chat, sender, body, days, chatType, chatName] of rows) {
  await store.put(
    buildMessageLink({
      source,
      externalId: String((id += 1)),
      sender,
      chat,
      body,
      timestamp: ago(days),
      chatType,
      chatName,
      senderName: sender === 'me' ? null : chatName,
    })
  );
}
const handle = await startServer({
  port,
  store,
  enableHandlers: false,
  enableSync: true,
  automations: {
    scheduler: false,
    setTyping: async ({ source, chat }) => {
      console.log(`[fake typing] ${source}:${chat}`);
      return { supported: true, demo: true };
    },
    send: async (draft) => {
      console.log(`[fake send] ${draft.source}:${draft.chat}\n${draft.text}`);
      if (draft.source === 'email') {
        throw new Error('no SMTP account configured (demo)');
      }
      return { ok: true, demo: true };
    },
  },
});
console.log(`http://127.0.0.1:${handle.port}/`);
