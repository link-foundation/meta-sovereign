// Isolated Q/A UI fixture, no credentials or provider traffic. Newline closes.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { SALARY_EXCHANGE_ID } from '../../js/src/automation/salary-exchange-state.js';

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-question-ui-'));
const store = createMemoryStore();
if (process.env.QUESTION_UI_EXCHANGE === '1') {
  await store.put({
    id: SALARY_EXCHANGE_ID,
    exchange: {
      base: 'RUB',
      rates: [{ code: 'USD', rate: 84.9048 }],
      asOf: new Date().toISOString().slice(0, 10),
      source: 'cbr',
      maxAgeDays: 7,
    },
    fetchedAt: new Date().toISOString(),
  });
}
let messages =
  process.env.QUESTION_UI_LANGUAGE === '1'
    ? [
        { id: 1, sender: 'interviewer', body: 'आप कहाँ रहते हैं' },
        { id: 2, sender: 'me', body: 'वियतनाम' },
        { id: 3, sender: 'interviewer', body: '请介绍您的经验' },
        { id: 4, sender: 'me', body: '五年软件开发经验。' },
      ]
    : [
        { id: 1, sender: 'interviewer', body: 'Какой у вас опыт?' },
        { id: 2, sender: 'me', body: 'Пять лет в распределённых командах.' },
        { id: 3, sender: 'interviewer', body: 'Где вы живёте?' },
      ];
if (process.env.QUESTION_UI_TURNS === '1') {
  messages = [
    {
      id: 1,
      sender: 'interviewer',
      body: 'Расскажите о вашем опыте с Kubernetes.',
    },
    { id: 2, sender: 'interviewer', body: 'Мы можем продолжить наше общение?' },
    { id: 3, sender: 'me', body: 'Здравствуйте!' },
    { id: 4, sender: 'me', body: 'Да, сопровождал кластер из 12 узлов.' },
    {
      id: 5,
      sender: 'interviewer',
      body: 'Thanks for the details! Where do you live?',
    },
    { id: 6, sender: 'me', body: 'Vietnam' },
  ];
}
for (const message of messages) {
  await store.put({
    ...message,
    id: `msg:hh:1:${message.id}`,
    source: 'hh',
    chat: '1',
    chatName: 'Interview fixture',
    chatType: 'personal_chat',
    timestamp: new Date(Date.UTC(2026, 10, 9, 10, 0, message.id)).toISOString(),
  });
}
const server = await startServer({
  store,
  storeDir: dir,
  port: 0,
  localUi: true,
  enableHandlers: false,
  enableSync: false,
  telegramAccount: false,
  automations: { scheduler: false },
});
try {
  console.log(JSON.stringify({ origin: `http://127.0.0.1:${server.port}` }));
  await new Promise((resolve) => {
    process.once('SIGTERM', resolve);
    process.once('SIGINT', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  await server.close();
  await rm(dir, { recursive: true, force: true });
  process.stdin.pause();
}
