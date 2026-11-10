import { putAll } from '../storage/universal.js';
import { loginError } from './telegram-login-lifecycle.js';
import { readLegacyTelegramText } from './telegram-legacy-config.js';

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
  try {
    const session = (await readLegacyTelegramText(file)).trim();
    if (!/^[A-Za-z0-9+/=_-]{40,}$/.test(session)) {
      throw new Error('invalid session');
    }
    return session;
  } catch (error) {
    if (['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) {
      throw error;
    }
    throw loginError(
      'SESSION_FILE',
      'expected a saved MTProto string session up to 64 KiB'
    );
  }
};
