// Offline manual/MCP fixture, isolated from the running application.
import { startServer } from '../../js/src/server/index.js';
import {
  usersFixture,
  userOf,
} from '../../js/tests/helpers/chat-users-fakes.mjs';
const fixture = usersFixture({
  participants: [
    userOf(1, { firstName: 'You' }),
    userOf(2, { firstName: 'Alice', lastName: 'Smith' }),
    userOf(3, { firstName: 'Bob' }),
    userOf(4, { bot: true, firstName: 'Helper bot' }),
    userOf(5, { contact: true, firstName: 'Existing contact' }),
  ],
  memberError: Object.assign(new Error('CHAT_ADMIN_REQUIRED'), {
    errorMessage: 'CHAT_ADMIN_REQUIRED',
  }),
  profiles: [userOf(6, { firstName: 'Forwarded author' })],
  messages: [2, 3, 4, 5, 6, 7].map((id) => ({
    id,
    fromId: { className: 'PeerUser', userId: BigInt(id) },
    message: 'Review notes',
  })),
});
await fixture.store.put({
  id: 'msg:telegram:-44:9',
  source: 'telegram',
  chat: '-44',
  chatName: 'Study group',
  chatType: 'group',
  body: 'Review users found in our history',
  sender: '2',
  senderName: 'Alice Smith',
  timestamp: new Date().toISOString(),
  raw: { id: 9 },
});
const account = {
  ...fixture.account,
  stop: fixture.env.chatUsersStop,
  status: async () => ({
    connected: true,
    kind: 'user',
    account: { username: 'owner' },
  }),
  history: async () => ({ written: 0, cached: true, complete: true }),
  chatInfo: async () => ({ kind: 'group', title: 'Study group' }),
  sharedCounts: async () => ({ ok: true, counts: {} }),
};
const handle = await startServer({
  store: fixture.store,
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: account,
  automations: { scheduler: false },
});
console.log(JSON.stringify({ origin: `http://127.0.0.1:${handle.port}` }));
try {
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  await handle.close();
  process.stdin.pause();
}
