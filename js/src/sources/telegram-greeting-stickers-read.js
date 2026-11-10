import { randomInt } from 'node:crypto';
import {
  cacheSticker,
  stickerPageOptions,
  stickerSummary,
} from './telegram-greeting-stickers-shape.js';
import { readStickerOrigin } from './telegram-greeting-stickers-fetch.js';
import {
  greetingStickerOwner,
  greetingStickerSummary,
} from './telegram-greeting-stickers-cache.js';

export const createGreetingStickerReads = (
  env,
  cache,
  context,
  now,
  currentJob
) => {
  const status = async (body = {}) => {
    const page = stickerPageOptions(body);
    if (!page) {
      return { ok: false, code: 'bad-request' };
    }
    try {
      const { owner } = await context();
      const saved = await cache.load(owner);
      const values = [...saved.items.values()].filter(
        (item) => !page.greetingsOnly || item.greeting
      );
      const job = currentJob();
      return {
        ok: true,
        job: job?.owner === owner ? globalThis.structuredClone(job) : null,
        cache: greetingStickerSummary(saved, now),
        stickers: values
          .slice(page.offset, page.offset + page.limit)
          .map(stickerSummary),
        offset: page.offset,
        more: page.offset + page.limit < values.length,
      };
    } catch (error) {
      return {
        ok: false,
        code:
          error.code === 'user-account-required' ? error.code : 'read-failed',
      };
    }
  };
  const select = async (c, id = null) => {
    const owner = await greetingStickerOwner(env, c);
    const saved = await cache.load(owner);
    const items = [...saved.items.values()].filter((item) => item.greeting);
    const item = id
      ? items.find((entry) => entry.id === id)
      : items.length
        ? items[randomInt(items.length)]
        : null;
    if (!item) {
      return null;
    }
    cache.register(item);
    return stickerSummary(item);
  };
  const again = async (id) => {
    const { c, owner } = await context();
    const saved = await cache.load(owner);
    const previous = saved.items.get(id);
    if (!previous) {
      throw new Error('sticker-unavailable');
    }
    const documents = await readStickerOrigin(env, c, previous.origin);
    const item = documents
      .map((doc) => cacheSticker(doc, previous.origin))
      .find((doc) => doc?.id === id);
    if (!item) {
      throw new Error('sticker-unavailable');
    }
    if ((await greetingStickerOwner(env, c)) !== owner) {
      throw new Error('account-changed');
    }
    await cache.save(
      owner,
      new Map(saved.items).set(id, item),
      saved.coverage,
      saved.updatedAt
    );
    cache.register(item);
  };
  return { status, select, again };
};
