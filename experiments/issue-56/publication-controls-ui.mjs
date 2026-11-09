// Isolated, offline publication review fixture. Newline closes the server.
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { saveTarget } from '../../js/src/broadcast/targets.js';
import { saveBroadcastCredentials } from '../../js/src/broadcast/credentials.js';

const store = createMemoryStore();
for (const [network, credentials] of [
  ['telegram', { botToken: 'offline-fixture-token' }],
  ['vk', { communityToken: 'offline-fixture-community' }],
  ['x', { accessToken: 'offline-fixture-user' }],
]) {
  await saveBroadcastCredentials(store, network, credentials);
}
for (const target of [
  {
    id: 'news',
    label: 'News channel',
    network: 'telegram',
    kind: 'channel',
    destination: '@fixture_news',
    format: 'html',
  },
  {
    id: 'team',
    label: 'Team group',
    network: 'telegram',
    kind: 'group',
    destination: '-100321',
  },
  {
    id: 'community',
    label: 'Community wall',
    network: 'vk',
    kind: 'community-wall',
    destination: '-123',
    authMode: 'community',
  },
  { id: 'updates', label: 'Updates on X', network: 'x', kind: 'account' },
]) {
  await saveTarget(store, target);
}
const resolveSource = (network) => ({
  live: {
    publishPost: async (content) => {
      if (network === 'vk') {
        throw Object.assign(
          new Error('Fixture: community write permission denied'),
          { code: 'permission' }
        );
      }
      return network === 'telegram'
        ? { ok: true, messageId: '81', chat: content.chat }
        : { data: { id: '82' } };
    },
    deletePost: async () => ({ deleted: true }),
    testConnection: async () => ({
      ok: true,
      verified: true,
      permissionsVerified: false,
    }),
  },
});
const handle = await startServer({
  store,
  port: 0,
  localUi: true,
  enableHandlers: false,
  enableSync: false,
  telegramAccount: false,
  automations: { scheduler: false },
  broadcasting: { resolveSource },
});
try {
  console.log(JSON.stringify({ origin: `http://127.0.0.1:${handle.port}` }));
  await new Promise((resolve) => {
    process.once('SIGTERM', resolve);
    process.once('SIGINT', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  await handle.close();
  process.stdin.pause();
}
