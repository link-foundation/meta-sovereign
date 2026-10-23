// "Stickers in this photo" (R-Y206; learned, never copied): a photo or
// video that has stickers on it (Telegram marks it `hasStickers`) offers
// the sticker sets it uses (messages.getAttachedStickers), in the photo
// viewer's menu and, for a video, on a small button over it. One set opens
// its box (./chat-sticker-box.js) at once; several are listed, a click
// opening the one chosen. The box adds (or removes) the set and sends one
// of its stickers, as a sticker in a chat does.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { SetThumb } from './chat-stickers.js';
import { Overlay, StickerSetBox, useEscape } from './chat-sticker-box.js';
import { registerAttachedDialog } from './chat-attached-button.js';

const el = React.createElement;

const errorText = (t, code) => {
  const key = `chat.extras.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.extras.err.failed') : text;
};

// The sets asked of the server once.
const useAttached = (api, chat, msgId) => {
  const [state, setState] = useState({ phase: 'loading', sets: [] });
  useEffect(() => {
    let live = true;
    Promise.resolve(
      api.telegramStickerAttached({ chat: String(chat), id: String(msgId) })
    )
      .then(
        (answer) =>
          live &&
          setState(
            answer?.ok
              ? { phase: 'ready', sets: answer.sets ?? [] }
              : { phase: 'error', code: answer?.code, sets: [] }
          )
      )
      .catch(() => live && setState({ phase: 'error', sets: [] }));
    return () => {
      live = false;
    };
  }, [api, chat, msgId]);
  return state;
};

const SetRow = ({ api, t, set, onPick }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'attached-set',
      'data-attached-set': set.id,
      onClick: () => onPick(set),
    },
    [
      el(
        'span',
        { key: 'c', className: 'sticker-setting-cover' },
        el(SetThumb, { api, set })
      ),
      el('span', { key: 'n', className: 'sticker-setting-name' }, [
        el('strong', { key: 't' }, set.title),
        el(
          'span',
          { key: 'k', className: 'meta' },
          t('chat.stickerSettings.count', { count: set.count })
        ),
      ]),
    ]
  );

const ListBody = ({ api, t, state, onPick }) => {
  if (state.phase === 'loading') {
    return el('p', { className: 'emoji-none' }, t('chat.stickers.loading'));
  }
  if (state.phase === 'error') {
    return el(
      'p',
      { className: 'emoji-none', role: 'alert' },
      errorText(t, state.code)
    );
  }
  return state.sets.length === 0
    ? el('p', { className: 'emoji-none' }, t('chat.extras.attachedNone'))
    : el(
        'div',
        { className: 'attached-sets' },
        state.sets.map((set) =>
          el(SetRow, { key: set.id, api, t, set, onPick })
        )
      );
};

/** The sets used in a photo or video of message `msgId` in `chat`. */
export const AttachedStickers = ({ api, chat, msgId, onClose }) => {
  const t = useT();
  const state = useAttached(api, chat, msgId);
  const [picked, setPicked] = useState(null);
  // A lone set opens its box at once.
  const only = state.sets.length === 1 ? state.sets[0] : null;
  const set = picked ?? only;
  useEscape(set ? null : onClose);
  if (set) {
    return el(StickerSetBox, {
      api,
      chat,
      from: { id: set.id, accessHash: set.accessHash },
      onClose: () => (picked ? setPicked(null) : onClose()),
    });
  }
  const view = el(
    Overlay,
    { label: t('chat.extras.attached'), onClose, className: 'sticker-box' },
    [
      el(
        'h3',
        { key: 'h', className: 'sticker-box-title' },
        t('chat.extras.attached')
      ),
      el(ListBody, { key: 'b', api, t, state, onPick: setPicked }),
    ]
  );
  const root = globalThis.document?.body;
  return root ? createPortal(view, root) : view;
};

registerAttachedDialog(AttachedStickers);
