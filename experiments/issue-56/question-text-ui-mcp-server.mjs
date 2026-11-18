import { createServer } from 'node:http';
import { startServer } from '../../js/src/server/index.js';
import { questionTextFixture } from './question-text-fixture.mjs';
import { textReplyExpected } from './text-reply-fixture.mjs';
import { seedQuestionBrowserChat } from './question-browser-fixture.mjs';

// Independent production UI/server check with a counted sender stub. Native
// provider delivery is covered separately by the production Chromium scenario.
let mode = 'normal';
let generation = 1;
const env = await questionTextFixture({
  replyText: (input) =>
    mode === 'unknown'
      ? null
      : {
          via: 'browser',
          source: input.source,
          chat: input.chat,
          text: input.text,
          messageId: String(Number(input.expected.question.id) + 1),
        },
});
const reset = (next = 'normal') => {
  if (!['normal', 'owner', 'unknown'].includes(next)) {
    throw new Error('Unknown fixture mode');
  }
  mode = next;
  const id = String(++generation * 100 + 1);
  env.state.snapshot = { ...textReplyExpected(), hasDraft: mode === 'owner' };
  env.state.snapshot.question.id = id;
  env.state.snapshot.pendingTurn.messages = [
    { id: String(Number(id) - 1), body: 'What is your expected salary?' },
    { ...env.state.snapshot.question },
  ];
  env.state.textReplies.length = 0;
};
reset();
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
  textReplies: env.state.textReplies.length,
  ordinarySends: env.state.sends.length,
  prefills: env.state.prefills.length,
  ownerDraft: mode === 'owner' ? 'Keep my own draft' : '',
  senderStub: true,
  liveProvider: false,
});
const control = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/reset') {
    reset(url.searchParams.get('mode') ?? 'normal');
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(stats()));
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
console.log(
  JSON.stringify({
    base: `http://127.0.0.1:${server.port}`,
    control: `http://127.0.0.1:${control.address().port}`,
  })
);
const close = async () => {
  await new Promise((resolve) => control.close(resolve));
  await server.close();
  console.log(JSON.stringify(stats()));
};
process.once('SIGTERM', close);
process.once('SIGINT', close);
