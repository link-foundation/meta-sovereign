// Offline provider answers on an isolated UI server. Newline closes it.
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { getSource, listSources } from '../../js/src/sources/index.js';

const restore = [];
for (const name of listSources()) {
  const live = getSource(name).live;
  if (!live) {
    continue;
  }
  restore.push(() => {
    live.post = original;
  });
  const original = live.post;
  live.post = async () => ({
    ok: false,
    code: 'permission',
    error: 'Fixture permission denied; no message was published.',
  });
}
const store = createMemoryStore();
const server = await startServer({
  store,
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
  restore.forEach((reset) => reset());
  process.stdin.pause();
}
