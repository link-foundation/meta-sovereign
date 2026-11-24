import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { loginError } from './telegram-login-lifecycle.js';

const MAX_BYTES = 65_536;
const configError = () =>
  loginError('SESSION_CONFIG', 'expected unambiguous Telegram configuration');
const fields = {
  apiId: ['TELEGRAM_USER_BOT_API_ID', 'TELEGRAM_API_ID', 'API_ID'],
  apiHash: ['TELEGRAM_USER_BOT_API_HASH', 'TELEGRAM_API_HASH', 'API_HASH'],
  phone: ['TELEGRAM_USER_BOT_PHONE', 'TELEGRAM_PHONE', 'PHONE'],
  session: ['TELEGRAM_USER_SESSION', 'TELEGRAM_SESSION'],
};
const keys = new Set(Object.values(fields).flat());

/** Read a regular UTF-8 file without evaluating it or loading it into env. */
export const readLegacyTelegramText = async (file) => {
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) {
      throw configError();
    }
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        length,
        bytes.length - length,
        null
      );
      if (!bytesRead) {
        break;
      }
      length += bytesRead;
    }
    if (length > MAX_BYTES) {
      throw configError();
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(
        bytes.subarray(0, length)
      );
    } catch {
      throw configError();
    }
  } finally {
    await handle.close();
  }
};

const fieldValues = (text) => {
  const values = new Map();
  for (const raw of String(text)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, '');
    const equal = line.indexOf('=');
    const key = line.slice(0, equal).trim();
    if (equal < 0 || !keys.has(key)) {
      continue;
    }
    const match = /^(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^#\s]*))\s*(?:#.*)?$/.exec(
      line.slice(equal + 1).trim()
    );
    if (!match) {
      throw configError();
    }
    const value = match[1] ?? match[2] ?? match[3];
    if (values.has(key) && values.get(key) !== value) {
      throw configError();
    }
    values.set(key, value);
  }
  return values;
};

const configValid = (config, requireSession) => {
  const formats = {
    apiId: /^[1-9]\d{0,9}$/,
    apiHash: /^[a-fA-F0-9]{32}$/,
    session: /^[A-Za-z0-9+/=_-]{40,}$/,
    phone: /^\+?[0-9][0-9 ()-]{4,31}$/,
  };
  if (
    !formats.apiId.test(config.apiId ?? '') ||
    !formats.apiHash.test(config.apiHash ?? '')
  ) {
    return false;
  }
  if (
    ['session', 'phone'].some(
      (key) => config[key] !== undefined && !formats[key].test(config[key])
    )
  ) {
    return false;
  }
  return requireSession
    ? Boolean(config.session)
    : Boolean(config.session || config.phone);
};

/** Follow's saved .env uses USER_BOT API/phone and USER_SESSION aliases.
 * Quotes/comments are literal syntax; substitutions and conflicting aliases
 * are rejected, so credentials cannot be assembled from different accounts. */
export const parseLegacyTelegramConfig = (text, requireSession = true) => {
  const values = fieldValues(text);
  const config = {};
  for (const [name, aliases] of Object.entries(fields)) {
    const found = [
      ...new Set(
        aliases.filter((k) => values.has(k)).map((k) => values.get(k))
      ),
    ];
    if (found.length > 1) {
      throw configError();
    }
    if (found.length && (found[0] || !['session', 'phone'].includes(name))) {
      config[name] = found[0];
    }
  }
  if (!configValid(config, requireSession)) {
    throw configError();
  }
  return config;
};

export const readLegacyTelegramConfig = async (file) =>
  parseLegacyTelegramConfig(await readLegacyTelegramText(file));
