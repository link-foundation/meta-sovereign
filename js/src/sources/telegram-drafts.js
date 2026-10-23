/**
 * Cloud drafts kept in step with the other devices, as Telegram Desktop
 * does (R-Y207; learned, never copied):
 * - `syncDrafts()` — messages.getAllDrafts, whose answer is a set of
 *   UpdateDraftMessage; each goes through the live handler's draft writer
 *   (the same one that follows a draft typed on the phone), and a stored
 *   draft Telegram no longer lists (cleared elsewhere) is emptied →
 *   `{ ok, drafts, cleared }`.
 * - `clearAllDrafts()` — messages.clearAllDrafts, then every stored draft
 *   is emptied → `{ ok, cleared }`.
 * The per-chat save (saveDraft in telegram-account.js) is untouched.
 */

import { updatesOfResult } from './telegram-catchup.js';
import { updateEffect } from './telegram-updates.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

const failure = failureOf({ FLOOD_WAIT: 'flood' });

// The chats whose stored read link holds a draft.
const draftedChats = async (store) => {
  const links = await store.query(
    (link) =>
      link?.id?.startsWith('read:telegram:') &&
      typeof link.draft === 'string' &&
      link.draft !== ''
  );
  return links.map((link) => String(link.chat));
};

// Empties the stored drafts of `chats`; how many.
const emptyDrafts = async (env, chats) => {
  for (const chat of chats) {
    await env.live?.draft?.({ chat, text: '', date: null });
  }
  return chats.length;
};

/** The drafts an answer of getAllDrafts holds: `[{ chat, text, date }]`. */
export const draftsOf = (answer) =>
  updatesOfResult(answer)
    .filter((update) => update?.className === 'UpdateDraftMessage')
    .map((update) => updateEffect(update))
    .filter((effect) => effect?.kind === 'draft');

export const createDrafts = (env, { userClient }) => ({
  syncDrafts: async () =>
    connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, 'drafts:all', () =>
        c.client.invoke(new c.Api.messages.GetAllDrafts())
      );
      const listed = draftsOf(answer).filter((d) => d.text !== '');
      for (const draft of listed) {
        await env.live?.draft?.(draft);
      }
      const here = new Set(listed.map((d) => d.chat));
      const stale = (await draftedChats(env.store)).filter(
        (chat) => !here.has(chat)
      );
      return {
        ok: true,
        drafts: listed.length,
        cleared: await emptyDrafts(env, stale),
      };
    }),
  clearAllDrafts: async () =>
    connected(env, userClient, failure, async (c) => {
      await runIn(env, 'drafts:clear', () =>
        c.client.invoke(new c.Api.messages.ClearAllDrafts())
      );
      return {
        ok: true,
        cleared: await emptyDrafts(env, await draftedChats(env.store)),
      };
    }),
});
