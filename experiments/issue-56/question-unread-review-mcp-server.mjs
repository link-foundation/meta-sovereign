import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../../js/src/server/index.js';
import {
  unreadReviewFixture,
  unreadPass,
} from './question-unread-review-fixture.mjs';
import { seedQuestionBrowserChat } from './question-browser-fixture.mjs';

// Independent public UI/service verification. Native traversal has a separate
// real-Chromium fixture; this counted boundary can hold cancellation precisely.
let mode = 'normal';
let pending = 0;
const env = await unreadReviewFixture(async ({ signal }) => {
  pending++;
  try {
    if (mode === 'owner') {
      throw Object.assign(new Error('The owner returned.'), {
        code: 'browser-background-owner-active',
        restoration: { restored: false, reason: 'owner-active' },
      });
    }
    if (mode === 'stop' && !signal.aborted) {
      try {
        await delay(5000, undefined, { signal });
      } catch (error) {
        if (error.name !== 'AbortError') {
          throw error;
        }
      }
    }
    const pass = unreadPass();
    if (signal.aborted) {
      pass.conversations = [];
      pass.coverage = { ...pass.coverage, visited: 0, reason: 'cancelled' };
    }
    return pass;
  } finally {
    pending--;
  }
});
await seedQuestionBrowserChat(env);
const server = await startServer({
  store: env.store,
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  log: null,
  automations: { scheduler: false, send: env.send },
});
const stats = () => ({
  scans: env.state.scans.length,
  pending,
  sends: env.state.sends.length,
  prefills: env.state.prefills.length,
  reads: env.state.reads.length,
  senderStub: true,
  liveProvider: false,
});
const control = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/seed') {
    await seedQuestionBrowserChat(env);
  }
  if (url.pathname === '/mode') {
    const next = url.searchParams.get('value');
    if (!['normal', 'owner', 'stop'].includes(next)) {
      res.writeHead(400).end();
      return;
    }
    mode = next;
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(stats()));
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
console.log(
  JSON.stringify({
    pid: process.pid,
    base: `http://127.0.0.1:${server.port}`,
    control: `http://127.0.0.1:${control.address().port}`,
  })
);
const close = async () => {
  await new Promise((resolve) => control.close(resolve));
  await server.close();
  await env.browser.close();
  console.log(JSON.stringify(stats()));
};
process.once('SIGTERM', close);
process.once('SIGINT', close);
