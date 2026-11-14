import { runIn } from './telegram-stickers.js';
import {
  GREETING_STICKER_CACHE,
  GREETING_STICKER_TTL,
  normalizeCachedSticker,
  restoreSticker,
} from './telegram-greeting-stickers-shape.js';

export const greetingStickerOwner = async (env, c) => {
  const me = await runIn(env, 'greeting-stickers:me', () => c.client.getMe());
  const id = String(me?.id?.value ?? me?.id ?? '');
  if (!/^[1-9]\d{0,19}$/.test(id) || me.bot || me.deleted) {
    throw Object.assign(new Error('user-account-required'), {
      code: 'user-account-required',
    });
  }
  return id;
};
export const greetingStickerSummary = (cache, now) => ({
  updatedAt: cache.updatedAt,
  stale:
    !cache.updatedAt ||
    now() - Date.parse(cache.updatedAt) >= GREETING_STICKER_TTL,
  total: cache.items.size,
  greetings: [...cache.items.values()].filter((item) => item.greeting).length,
  coverage: globalThis.structuredClone(cache.coverage),
});
export const createGreetingStickerCache = (env, lists) => {
  const caches = new Map();
  const register = (item) =>
    lists.remember([restoreSticker(item)], `greeting:${item.id}`, 'sticker');
  const load = async (owner) => {
    if (caches.has(owner)) {
      return caches.get(owner);
    }
    const saved = await env.store.get(`${GREETING_STICKER_CACHE}:${owner}`);
    const items = new Map();
    const source = Array.isArray(saved?.documents)
      ? saved.documents.slice(0, 50_000)
      : [];
    for (const value of source) {
      const item = normalizeCachedSticker(value);
      if (item) {
        items.set(item.id, item);
      }
    }
    const cache = {
      items,
      updatedAt:
        typeof saved?.updatedAt === 'string' &&
        Number.isFinite(Date.parse(saved.updatedAt))
          ? saved.updatedAt
          : null,
      coverage: saved?.coverage ?? null,
    };
    if (caches.size >= 3) {
      caches.delete(caches.keys().next().value);
    }
    caches.set(owner, cache);
    return cache;
  };
  const save = async (owner, items, coverage, updatedAt) => {
    await env.store.put({
      id: `${GREETING_STICKER_CACHE}:${owner}`,
      kind: 'telegram-greeting-stickers',
      source: 'telegram',
      owner,
      updatedAt,
      coverage: globalThis.structuredClone(coverage),
      documents: [...items.values()],
    });
    const cache = {
      items,
      coverage: globalThis.structuredClone(coverage),
      updatedAt,
    };
    caches.set(owner, cache);
    return cache;
  };
  return { load, save, register };
};
