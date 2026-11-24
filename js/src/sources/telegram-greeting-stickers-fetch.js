import { runIn } from './telegram-stickers.js';
import {
  cacheSticker,
  stickerReadCode,
} from './telegram-greeting-stickers-shape.js';

const text = (value) => String(value?.value ?? value ?? '');
export const stickerSetOrigin = (set) => ({
  kind: 'set',
  id: text(set.id),
  accessHash: text(set.accessHash),
  shortName: String(set.shortName ?? ''),
});
export const readStickerOrigin = (env, c, origin) =>
  runIn(
    env,
    `greeting-stickers:${origin.kind}:${origin.id ?? ''}`,
    async () => {
      if (origin.kind === 'set') {
        const stickerset =
          /^-?\d{1,20}$/.test(origin.id) &&
          /^-?\d{1,20}$/.test(origin.accessHash)
            ? new c.Api.InputStickerSetID({
                id: c.helpers.returnBigInt(origin.id),
                accessHash: c.helpers.returnBigInt(origin.accessHash),
              })
            : new c.Api.InputStickerSetShortName({
                shortName: origin.shortName,
              });
        const answer = await c.client.invoke(
          new c.Api.messages.GetStickerSet({ stickerset, hash: 0 })
        );
        if (!Array.isArray(answer?.documents)) {
          throw new Error('invalid-set-documents');
        }
        return answer.documents;
      }
      const Request = {
        recent: c.Api.messages.GetRecentStickers,
        faved: c.Api.messages.GetFavedStickers,
      }[origin.kind];
      if (!Request) {
        throw new Error('invalid-sticker-origin');
      }
      const answer = await c.client.invoke(new Request({ hash: c.zero }));
      if (!Array.isArray(answer?.stickers)) {
        throw new Error('invalid-sticker-documents');
      }
      return answer.stickers;
    }
  );
const collectDocuments = (r, documents, origin) => {
  for (const doc of documents) {
    const item = cacheSticker(doc, origin);
    if (!item) {
      r.job.rejected += 1;
      continue;
    }
    if (!r.items.has(item.id) && r.items.size >= r.job.options.maxDocuments) {
      r.job.limited = true;
      break;
    }
    r.items.set(item.id, item);
  }
};
const collectSet = async (r, set) => {
  const key = text(set?.id) || set?.shortName;
  if (!key) {
    throw new Error('invalid-sticker-set');
  }
  if (r.sets.has(key)) {
    return;
  }
  if (r.sets.size >= r.job.options.maxSets) {
    r.job.limited = true;
    return;
  }
  r.sets.add(key);
  const origin = stickerSetOrigin(set);
  collectDocuments(r, await readStickerOrigin(r.env, r.c, origin), origin);
};
const featured = async (r) => {
  const coverage = r.job.coverage.featured;
  const seen = new Set();
  const maxPages = Math.ceil(r.job.options.maxSets / 100) + 1;
  let offset = 0;
  for (;;) {
    if (r.cancelled() || r.job.limited) {
      break;
    }
    if (seen.size >= maxPages) {
      r.job.limited = true;
      break;
    }
    const answer = await runIn(
      r.env,
      `greeting-stickers:featured:${offset}`,
      () =>
        r.c.client.invoke(
          new r.c.Api.messages.GetOldFeaturedStickers({
            offset,
            limit: 100,
            hash: r.c.zero,
          })
        )
    );
    if (!Array.isArray(answer?.sets)) {
      throw new Error('invalid-featured-page');
    }
    const page = answer.sets;
    if (!page.length) {
      coverage.complete = coverage.failures === 0;
      break;
    }
    const fingerprint = page.map((cover) => text(cover.set?.id)).join(',');
    if (seen.has(fingerprint)) {
      coverage.error = 'pagination-stalled';
      break;
    }
    seen.add(fingerprint);
    for (const cover of page) {
      if (r.cancelled() || r.job.limited) {
        break;
      }
      try {
        await collectSet(r, cover.set);
      } catch (error) {
        coverage.failures += 1;
        coverage.error = stickerReadCode(error);
      }
    }
    offset += page.length;
    coverage.read = offset;
    await r.publish();
    if (page.length < 100) {
      coverage.complete = coverage.failures === 0 && !r.job.limited;
      break;
    }
  }
};
const masks = async (r) => {
  const result = await runIn(r.env, 'greeting-stickers:masks', () =>
    r.c.client.invoke(new r.c.Api.messages.GetMaskStickers({ hash: r.c.zero }))
  );
  if (!Array.isArray(result?.sets)) {
    throw new Error('invalid-mask-list');
  }
  for (const set of result.sets) {
    if (r.cancelled() || r.job.limited) {
      break;
    }
    try {
      await collectSet(r, set);
    } catch (error) {
      r.job.coverage.masks.failures += 1;
      r.job.coverage.masks.error = stickerReadCode(error);
    }
    r.job.coverage.masks.read += 1;
  }
};
export const fetchGreetingStickers = async (r) => {
  const personal = async (kind) => {
    const documents = await readStickerOrigin(r.env, r.c, { kind });
    r.job.coverage[kind].read = documents.length;
    collectDocuments(r, documents, { kind });
  };
  const sources = {
    featured: () => featured(r),
    masks: () => masks(r),
    recent: () => personal('recent'),
    faved: () => personal('faved'),
  };
  for (const [name, use] of Object.entries(sources)) {
    if (r.cancelled()) {
      break;
    }
    r.job.phase = name;
    try {
      await use();
      if (name !== 'featured') {
        r.job.coverage[name].complete =
          !r.cancelled() && !r.job.limited && !r.job.coverage[name].error;
      }
    } catch (error) {
      r.job.coverage[name].error = stickerReadCode(error);
    }
    r.job.documents = r.items.size;
    await r.publish();
  }
};
