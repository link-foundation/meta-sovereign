import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { startServer } from '../../js/src/server/index.js';
import { applicationChatsFixture } from './application-chats-fixture.mjs';

const passId = `question-unread:${randomUUID()}`;
const target = { passId, chat: '8', questionId: '807' };
const cleanup = [];
let refreshes = 0;
let lastSkip;
const unread = (id) => ({
  id,
  state: 'active',
  owned: true,
  watchWaiting: true,
  polling: {
    phase: 'waiting',
    lastPassId: passId,
    receiptPassId: passId,
    lastSkip,
  },
  restoration:
    refreshes && !lastSkip
      ? {
          heldReview: {
            ...target,
            currentQuestionId: target.questionId,
            url: 'https://hh.ru/chat/8',
            title: 'Synthetic employer · Python engineer',
          },
        }
      : { restored: true },
});
const f = applicationChatsFixture(
  { after: (close) => cleanup.unshift(close) },
  {
    questionPolling: {
      unreadStatus: async ({ id }) => unread(id),
      unreadRefresh: () => refreshes++,
      unreadRefreshPending: () => !lastSkip,
      unreadSkip: async ({ id, ...selected }) => {
        lastSkip = selected;
        return unread(id);
      },
    },
  }
);
const server = await startServer({
  port: 0,
  localUi: true,
  store: f.store,
  vacancies: {
    ...f.serviceOptions,
    availability: async () => ({ available: true }),
  },
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  automations: { scheduler: false },
  log: null,
});
const stats = () => ({
  child: f.worker()?.status() ?? null,
  applications: f.state.submitted,
  refreshes,
  lastSkip,
  browserClosed: f.calls.close,
  senderStub: true,
  liveProvider: false,
});
const control = createServer((_request, response) => {
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(stats()));
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
console.log(
  JSON.stringify({
    pid: process.pid,
    base: `http://127.0.0.1:${server.port}`,
    control: `http://127.0.0.1:${control.address().port}`,
  })
);
await new Promise((resolve) => {
  process.once('SIGTERM', resolve);
  process.once('SIGINT', resolve);
});
try {
  await server.close();
  for (const close of cleanup) {
    await close();
  }
} finally {
  await new Promise((resolve) => control.close(resolve));
}
console.log(JSON.stringify({ ...stats(), resourcesClosed: true }));
