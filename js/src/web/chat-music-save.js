// "Add to profile music" on a song message, as Telegram Desktop's message
// menu has it (R-Y185; learned, never copied): the song of an audio message
// (not a voice note) is saved to the user's own profile
// (account.saveMusic, on the server); a click is the only write.

import { useCallback } from 'react';
import { networkMessageId } from './chat-model.js';

const TOAST_MS = 2500;

/** Whether a message is a song of Telegram's (an audio, not a voice note). */
export const isSongMessage = (message) => {
  const doc = message?.raw?.media?.document;
  const audio = (doc?.attributes ?? []).find(
    (a) => a?.className === 'DocumentAttributeAudio'
  );
  return (
    message?.source === 'telegram' &&
    Boolean(doc) &&
    !audio?.voice &&
    (Boolean(audio) || /^audio\//.test(doc.mimeType ?? ''))
  );
};

/** `save(message)`: saves the song, with a toast or the failure's words. */
export const useMusicSave = ({ api, state }) =>
  useCallback(
    async (message) => {
      if (typeof api?.telegramMusicSave !== 'function') {
        return;
      }
      const answer = await Promise.resolve(
        api.telegramMusicSave({
          chat: String(state.current.chat),
          message: networkMessageId(message),
        })
      ).catch((error) => ({ error: error.message }));
      if (!answer?.ok) {
        state.notify?.({
          kind: 'failed',
          code: answer?.code,
          error: answer?.error ?? 'not saved',
          retryAfter: answer?.retryAfter,
        });
        return;
      }
      const notice = { kind: 'music-saved' };
      state.notify?.(notice);
      globalThis.setTimeout(
        () => state.notify?.((now) => (now === notice ? null : now)),
        TOAST_MS
      );
    },
    [api, state.current?.chat]
  );
