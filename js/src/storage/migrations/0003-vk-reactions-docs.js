/**
 * 0003 — VK reactions as emoji and documents by their kind (R-Z8, R-Z17).
 *
 * Before R-Z8 a VK reaction was stored as `{ emoji: '3', count }`: the
 * number VK sends, which a page cannot draw. R-Z8 stores the emoji and
 * keeps the number as `reactionId`. A VK document of type 3 (gif) or 4
 * (image) used to be stored as a `file`; R-Z8 stores `gif` / `photo`
 * (and its `ext`).
 *
 * Recomputed only from stored fields (`reactions`, and `raw.attachments`
 * for documents). A numeric reaction VK has no emoji for stays a number;
 * a message whose `raw` was not kept keeps its attachments. Message ids,
 * chat ids, senders and times did not change. Idempotent: a reaction
 * that has `reactionId`, and a non-`file` document, are fixed points.
 */

import { VK_REACTION_EMOJI_TO_ID } from '../../sources/vk.js';

export const id = '0003-vk-reactions-docs';
export const from = 2;
export const to = 3;
export const description =
  'VK: numeric reactions become emoji with reactionId; image and gif documents stored as files get their kind.';

const EMOJI_OF = Object.fromEntries(
  Object.entries(VK_REACTION_EMOJI_TO_ID).map(([emoji, n]) => [n, emoji])
);

const isVk = (link) =>
  link?.source === 'vk' && String(link.id).startsWith('msg:vk:');

const fixReactions = (reactions) => {
  let changed = false;
  const next = reactions.map((r) => {
    if (r?.reactionId !== undefined || !/^\d+$/.test(String(r?.emoji))) {
      return r;
    }
    changed = true;
    const n = Number(r.emoji);
    return { ...r, emoji: EMOJI_OF[n] ?? r.emoji, reactionId: n };
  });
  return changed ? next : null;
};

const DOC_KIND = { 3: 'gif', 4: 'photo' };

// A stored `file` is matched to its raw document by title and url, so an
// attachment of another type can never be mistaken for it.
const fixAttachments = (link) => {
  const docs = (link.raw?.attachments ?? [])
    .filter((a) => a?.type === 'doc' && DOC_KIND[a.doc?.type])
    .map((a) => a.doc);
  if (!docs.length || !Array.isArray(link.attachments)) {
    return null;
  }
  let changed = false;
  const next = link.attachments.map((a) => {
    const doc =
      a?.kind === 'file'
        ? docs.find(
            (d) => (d.title ?? null) === a.name && (d.url ?? null) === a.url
          )
        : null;
    if (!doc) {
      return a;
    }
    changed = true;
    return { ...a, kind: DOC_KIND[doc.type], ext: doc.ext ?? null };
  });
  return changed ? next : null;
};

const fixed = (link) => {
  const reactions = Array.isArray(link.reactions)
    ? fixReactions(link.reactions)
    : null;
  const attachments = fixAttachments(link);
  return reactions || attachments
    ? {
        ...link,
        ...(reactions ? { reactions } : {}),
        ...(attachments ? { attachments } : {}),
      }
    : null;
};

export const up = async (ctx) => {
  let reactions = 0;
  await ctx.scan({ prefix: 'msg:vk:', where: isVk }, async (batch) => {
    const out = batch.map(fixed).filter(Boolean);
    reactions += out.length;
    await ctx.putMany(out);
  });
  ctx.log('vk_reactions_docs', { messages: reactions });
};
