// "Save GIF" / "Remove from GIFs" on a GIF message, as Telegram Desktop's
// message menu has them (R-Y171; learned, never copied). The saved GIFs'
// ids are asked once per chat opened; a click saves or removes the
// message's GIF (messages.saveGif, on the server), the set follows, and
// the panel's saved list is asked again.

import { useCallback, useEffect, useState } from 'react';
import { networkMessageId } from './chat-model.js';
import { forgetGifs, watchGifs } from './chat-stickers.js';
import { gifIdOf } from './gif-id.js';

/**
 * `{ ids, toggle(message) }`: `ids` the Set of saved GIF ids (null until
 * known, or without the saved list), `toggle` saves the message's GIF, or
 * removes it when it is saved.
 */
export const useSavedGifs = ({ api, state }) => {
  const [ids, setIds] = useState(null);
  const chatKey = state.current?.key ?? null;
  const canSave =
    state.current?.source === 'telegram' &&
    typeof api?.telegramGifSave === 'function';
  // Asked when a chat opens, and again when the panel changed them.
  const [changes, setChanges] = useState(0);
  useEffect(() => watchGifs(() => setChanges((n) => n + 1)), []);
  useEffect(() => {
    if (!canSave || typeof api.telegramGifs !== 'function') {
      return undefined;
    }
    let live = true;
    Promise.resolve(api.telegramGifs({}))
      .then((answer) => {
        if (live && answer?.ok) {
          setIds(new Set(answer.gifs.map((g) => g.id)));
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, chatKey, canSave, changes]);
  const toggle = useCallback(
    async (message) => {
      const id = gifIdOf(message);
      const unsave = Boolean(id && ids?.has(id));
      const answer = await Promise.resolve(
        api.telegramGifSave({
          chat: String(state.current.chat),
          message: networkMessageId(message),
          unsave,
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
      forgetGifs();
      setIds((before) => {
        const next = new Set(before ?? []);
        next[unsave ? 'delete' : 'add'](answer.id ?? id);
        return next;
      });
    },
    [api, state.current?.chat, ids]
  );
  return { ids: canSave ? ids : null, toggle };
};
