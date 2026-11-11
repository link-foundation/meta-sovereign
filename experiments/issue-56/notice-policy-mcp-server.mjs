// Lightweight UI-only fixture. Native delivery is verified by the separate
// browser probe; this server exposes no real account or provider browser.
import { startServer } from '../../js/src/server/index.js';
import { noticePolicyFixture } from './notice-policy-fixture.mjs';
import {
  seedQuestionBrowserChat,
  seedQuestionBrowserRead,
} from './question-browser-fixture.mjs';
import { createServer } from 'node:http';

const env = await noticePolicyFixture();
await seedQuestionBrowserChat(env);
const server = await startServer({
  store: env.store,
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  automations: { scheduler: false, send: env.send },
  log: null,
});
const control = createServer(async (req, res) => {
  if (req.url === '/unread') {
    await seedQuestionBrowserRead(env.store);
  }
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({ opens: env.state.opens, sends: env.state.sends.length })
  );
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
console.log(
  JSON.stringify({
    base: `http://127.0.0.1:${server.port}`,
    control: `http://127.0.0.1:${control.address().port}`,
    nativeProvider: false,
  })
);
let closing;
const close = () =>
  (closing ??= (async () => {
    await new Promise((resolve) => control.close(resolve));
    await server.close();
    await env.browser.close();
  })());
process.once('SIGINT', close);
process.once('SIGTERM', close);
