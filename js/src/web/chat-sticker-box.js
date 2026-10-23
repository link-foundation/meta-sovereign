/**
 * A sticker set's box, as Telegram Desktop's (R-Y124; learned, never
 * copied): a click on a sticker in a chat opens a dialog with the set's
 * title and its stickers; a click on one sends it to the open chat and
 * closes the box; the button below adds the set ("Add 12 stickers") or,
 * for one the user has, removes it ("Remove 12 stickers"). Escape or a
 * click outside closes it. The set is named by the sticker's own
 * attribute in the stored message (its id and access hash, or its short
 * name); the stickers come through the server like the panel's.
 *
 * Also the question asked before a set is removed from the panel.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { MediaSticker } from './chat-media.js';
import { Grid } from './chat-stickers.js';
import { topicReplyId } from './forum-topics.js';
import { sendAsField } from './chat-send-as.js';

const el = React.createElement;

const DIGITS = /^-?\d{1,20}$/;
const SHORT_NAME = /^[A-Za-z0-9_]{1,64}$/;
let sent = 0;

const plain = (value) => String(value?.value ?? value ?? '');

/**
 * The set a sticker message names: `{ id, accessHash }` or
 * `{ shortName }`, else null.
 */
export const stickerSetOf = (media) => {
  const attrs = media?.document?.attributes;
  const mark = (Array.isArray(attrs) ? attrs : []).find(
    (a) => a?.className === 'DocumentAttributeSticker'
  );
  const set = mark?.stickerset;
  if (set?.className === 'InputStickerSetShortName') {
    return SHORT_NAME.test(plain(set.shortName))
      ? { shortName: plain(set.shortName) }
      : null;
  }
  if (set?.className === 'InputStickerSetID') {
    const id = plain(set.id);
    const accessHash = plain(set.accessHash);
    return DIGITS.test(id) && DIGITS.test(accessHash)
      ? { id, accessHash }
      : null;
  }
  return null;
};

// Escape closes the box or the question.
const useEscape = (onClose) => {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const key = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        latest.current?.();
      }
    };
    globalThis.addEventListener?.('keydown', key);
    return () => globalThis.removeEventListener?.('keydown', key);
  }, []);
};

const Overlay = ({ label, onClose, className, children }) =>
  el(
    'div',
    {
      className: 'delete-dialog-overlay sticker-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': label,
      // React bubbles a portal's clicks to the sticker under it, which
      // would open the box again.
      onClick: (event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) {
          onClose();
        }
      },
    },
    el('div', { className: `delete-dialog ${className}` }, children)
  );

/** The question before an installed set leaves the user's sets. */
export const RemoveSetDialog = ({ set, onClose, onConfirm }) => {
  const t = useT();
  useEscape(onClose);
  return el(
    Overlay,
    { label: t('chat.stickers.removeSet'), onClose, className: 'sticker-ask' },
    [
      el(
        'p',
        { key: 'q', className: 'sticker-ask-text' },
        t('chat.stickers.removeSetAsk', { title: set.title })
      ),
      el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'ok',
            type: 'button',
            className: 'danger',
            'data-action': 'remove-set-confirm',
            onClick: onConfirm,
          },
          t('chat.stickers.removeSet')
        ),
        el(
          'button',
          { key: 'no', type: 'button', onClick: onClose },
          t('common.cancel')
        ),
      ]),
    ]
  );
};

// The set asked of the server; `{ error }` if it could not be.
const useBox = (api, ref) => {
  const [answer, setAnswer] = useState(null);
  const key = JSON.stringify(ref);
  useEffect(() => {
    let active = true;
    Promise.resolve(api.telegramStickerSetBox(ref))
      .then((got) => active && setAnswer(got?.ok ? got : { error: true }))
      .catch(() => active && setAnswer({ error: true }));
    return () => {
      active = false;
    };
  }, [api, key]);
  return answer;
};

// The stickers, or what stands in their place.
const BoxBody = ({ api, answer, onSend }) => {
  const t = useT();
  if (answer?.error || !answer) {
    return el(
      'p',
      { className: 'emoji-none' },
      t(answer ? 'chat.stickers.boxFailed' : 'chat.stickers.loading')
    );
  }
  return el(
    'div',
    { className: 'sticker-box-scroll' },
    el(Grid, { api, list: answer.items, onSend, where: 'box' })
  );
};

// "Add 12 stickers", or "Remove 12 stickers" for a set the user has.
const BoxButton = ({ set, busy, onClick }) => {
  const t = useT();
  return el(
    'button',
    {
      type: 'button',
      className: set.installed
        ? 'sticker-box-button danger'
        : 'sticker-box-button primary',
      'data-action': set.installed ? 'box-remove' : 'box-add',
      disabled: busy,
      onClick,
    },
    t(set.installed ? 'chat.stickers.boxRemove' : 'chat.stickers.boxAdd', {
      count: set.count,
    })
  );
};

/**
 * The box: `chat` is where a picked sticker is sent, into `topic` in a
 * forum (R-Y122).
 */
export const StickerSetBox = ({ api, chat, topic = null, from, onClose }) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const answer = useBox(api, from);
  useEscape(onClose);
  const set = answer?.set ?? null;
  const send = (item) => {
    onClose();
    sent += 1;
    const replyTo = topicReplyId(topic);
    api.telegramSendDocument({
      chat: String(chat),
      ...(replyTo ? { replyTo } : {}),
      id: item.id,
      ...sendAsField(chat),
      clientId: `doc-${Date.now()}-${sent}`,
    });
  };
  const toggle = async () => {
    setBusy(true);
    const got = await Promise.resolve(
      api.telegramStickerSetInstall?.({ id: set.id, install: !set.installed })
    ).catch(() => null);
    if (got?.ok) {
      onClose();
      return;
    }
    setBusy(false);
    setFailed(true);
  };
  const view = el(
    Overlay,
    {
      label: set?.title || t('chat.stickers.title'),
      onClose,
      className: 'sticker-box',
    },
    [
      el('h3', { key: 'h', className: 'sticker-box-title' }, set?.title ?? ''),
      el(BoxBody, { key: 'body', api, answer, onSend: send }),
      failed
        ? el(
            'p',
            { key: 'f', className: 'sticker-box-failed', role: 'alert' },
            t('chat.stickers.boxFailed')
          )
        : null,
      set ? el(BoxButton, { key: 'b', set, busy, onClick: toggle }) : null,
    ]
  );
  const root = globalThis.document?.body;
  return root ? createPortal(view, root) : view;
};

/**
 * A sticker in a message: a click on it opens its set's box, where the
 * server can ask the set.
 */
export const MediaStickerBox = (props) => {
  const [open, setOpen] = useState(false);
  const from =
    typeof props.api?.telegramStickerSetBox === 'function'
      ? stickerSetOf(props.media)
      : null;
  return el(React.Fragment, null, [
    el(MediaSticker, {
      key: 's',
      ...props,
      onOpen: from ? () => setOpen(true) : null,
    }),
    open
      ? el(StickerSetBox, {
          key: 'box',
          api: props.api,
          chat: props.chat,
          topic: props.topic ?? null,
          from,
          onClose: () => setOpen(false),
        })
      : null,
  ]);
};
