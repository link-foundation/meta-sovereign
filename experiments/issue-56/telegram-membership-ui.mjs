// Isolated production invite UI with actual adapter actions and offline RPCs.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import {
  membershipFixture,
  memberUpdates,
} from '../../js/tests/helpers/telegram-membership.mjs';

const fixture = await membershipFixture((request) => {
  if (request.className === 'messages.CheckChatInvite') {
    return {
      className: 'ChatInvitePeek',
      chat: memberUpdates().chats[0],
      expires: 2_000_000_000,
    };
  }
  return {
    className: 'messages.ChatInviteJoinResultWebView',
    botId: 1n,
    queryId: 5n,
  };
});
await fixture.store.put({
  id: 'msg:telegram:-1005:1',
  source: 'telegram',
  chat: '-1005',
  chatName: 'Invite evidence',
  chatType: 'supergroup',
  sender: '31',
  senderName: 'Member',
  timestamp: new Date().toISOString(),
  body: 'Study circle: https://t.me/+PeekHash1234',
});
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-membership-ui-'));
const handle = await startServer({
  store: fixture.store,
  storeDir: dir,
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  automations: { scheduler: false },
  telegramAccount: {
    ...fixture.actions,
    status: async () => ({
      connected: true,
      kind: 'user',
      account: { username: 'owner' },
    }),
    callsList: async () => ({ ok: true, calls: [], next: null }),
    stop: async () => {},
  },
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
  await rm(dir, { recursive: true, force: true });
  process.stdin.pause();
}
