import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../../src/storage/universal.js';
import { createTelegramMtproto } from '../../src/sources/telegram-mtproto.js';
import { createTelegramCreds } from '../../src/sources/auto-import/telegram-creds.js';

export const loginFixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ms-login-ui-'));
  const legacy = `1${'Ab9Zx'.repeat(14)}`;
  const original = `${legacy}\n`;
  const file = path.join(root, '.telegram_session');
  await writeFile(file, original, { mode: 0o600 });
  await writeFile(
    path.join(root, '.env'),
    'API_ID=2040\nAPI_HASH=0123456789abcdef0123456789abcdef\nPHONE=+15551234567\n',
    { mode: 0o600 }
  );
  const phoneFolder = path.join(root, 'phone-login');
  await mkdir(phoneFolder);
  await writeFile(
    path.join(phoneFolder, '.env'),
    'API_ID=2040\nAPI_HASH=0123456789abcdef0123456789abcdef\nPHONE=+15557654321\n',
    { mode: 0o600 }
  );
  const store = createMemoryStore();
  await store.put({
    id: 'msg:telegram:11:1',
    source: 'telegram',
    chat: '11',
    chatName: 'Ann Lee',
    sender: '11',
    senderName: 'Ann Lee',
    body: 'Isolated login fixture',
    timestamp: new Date().toISOString(),
  });
  const clients = [];
  const mtproto = createTelegramMtproto({
    clientFactory: async () => {
      const client = {
        closed: false,
        async connect() {},
        async destroy() {
          this.closed = true;
        },
        async start({ phoneCode, password, onError }) {
          for (const [prompt, accepted, error] of [
            [phoneCode, '12345', 'PHONE_CODE_INVALID'],
            [password, 'fixture-password', 'PASSWORD_HASH_INVALID'],
          ]) {
            for (let i = 0; i < 3; i++) {
              if ((await prompt()) === accepted) {
                break;
              }
              if ((await onError(new Error(error))) || i === 2) {
                throw new Error('AUTH_USER_CANCEL');
              }
            }
          }
        },
        getMe: async () => ({
          id: 7n,
          username: 'verified_fixture',
          phone: '+15551234567',
        }),
        session: { save: () => 'SYNTHETIC_OFFLINE_SESSION' },
      };
      clients.push(client);
      return client;
    },
  });
  const creds = createTelegramCreds({
    dataDir: root,
    homeDir: root,
    cwd: root,
    mtproto: (options) =>
      Promise.resolve({ getMe: () => mtproto.identify(options) }),
  });
  return {
    store,
    clients,
    mtproto,
    creds,
    legacy,
    unchanged: async () => (await readFile(file, 'utf8')) === original,
    close: () => rm(root, { recursive: true, force: true }),
  };
};
