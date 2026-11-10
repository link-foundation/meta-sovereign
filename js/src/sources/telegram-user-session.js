import { open } from 'node:fs/promises';
import { putAll } from '../storage/universal.js';
import { loginError } from './telegram-login-lifecycle.js';

export const saveTelegramUserSession = async (
  store,
  { apiId, apiHash, session }
) => {
  const updated = new Date().toISOString();
  const links = [
    ['api-id', String(apiId)],
    ['api-hash', apiHash],
    ['user-session', session],
  ].map(([name, value]) => ({
    id: `secret:telegram:${name}`,
    tokens: ['secret', 'telegram', name],
    value,
    updated,
  }));
  await putAll(store, links);
};

// Explicit legacy-file import is read-only and bounded, even if the file
// grows after stat. SQLite/Telethon and binary files are not string sessions.
export const readLegacyTelegramSession = async (file) => {
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 65_536) {
      throw loginError(
        'SESSION_FILE',
        'expected a string-session file up to 64 KiB'
      );
    }
    const bytes = Buffer.alloc(65_537);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        null
      );
      if (!bytesRead) {
        break;
      }
      offset += bytesRead;
    }
    const session = bytes.subarray(0, offset).toString('utf8').trim();
    if (offset > 65_536 || !/^[A-Za-z0-9+/=_-]{40,}$/.test(session)) {
      throw loginError(
        'SESSION_FILE',
        'expected a saved MTProto string session'
      );
    }
    return session;
  } finally {
    await handle.close();
  }
};
