import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../../src/storage/universal.js';
import { createTelegramMtproto } from '../../src/sources/telegram-mtproto.js';
import { createTelegramCreds } from '../../src/sources/auto-import/telegram-creds.js';

export const followSessionFixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ms-follow-session-'));
  const session = `1${'SyntheticBase64'.repeat(5)}`;
  const original = [
    'TELEGRAM_USER_BOT_API_ID=2040',
    'TELEGRAM_USER_BOT_API_HASH=0123456789abcdef0123456789abcdef',
    'TELEGRAM_USER_BOT_PHONE=+15551234567',
    `TELEGRAM_USER_SESSION="${session}"`,
    '',
  ].join('\n');
  const file = path.join(root, '.env');
  await writeFile(file, original, { mode: 0o600 });
  const store = createMemoryStore();
  store.close = async () => {};
  await store.put({
    id: 'secret:telegram:user-session',
    value: 'previous-session',
  });
  const state = { refuse: false, id: '7', clients: [], connected: 0 };
  const mtproto = createTelegramMtproto({
    clientFactory: async () => {
      const client = {
        closed: false,
        connect: async () => {},
        async destroy() {
          this.closed = true;
        },
        getMe: async () => {
          await state.beforeMe?.();
          if (state.refuse) {
            throw new Error('PRIVATE_SESSION_DETAIL');
          }
          return {
            id: state.id,
            username: 'follow_owner',
            phone: '15551234567',
          };
        },
      };
      state.clients.push(client);
      return client;
    },
  });
  const creds = createTelegramCreds({
    dataDir: root,
    homeDir: root,
    cwd: root,
    fetchImpl: null,
    mtproto: async (options) => ({ getMe: () => mtproto.identify(options) }),
  });
  const account = {
    status: async () => ({ connected: false, capabilities: {} }),
    connected: async () => {
      state.connected++;
    },
    stop: async () => {},
  };
  return {
    root,
    store,
    state,
    creds,
    mtproto,
    account,
    file,
    session,
    original,
    unchanged: async () => (await readFile(file, 'utf8')) === original,
    close: () => rm(root, { recursive: true, force: true }),
  };
};
