// The small button over a video that has stickers on it (R-Y206), and
// what says a photo or video has some. A leaf module, so the media parts
// can use it without pulling in the sticker panel: the dialog it opens
// (./chat-attached-stickers.js) registers itself when the chat screen
// loads.

import React, { useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

let Dialog = null;

/** The dialog the button opens (called by ./chat-attached-stickers.js). */
export const registerAttachedDialog = (component) => {
  Dialog = component;
};

/** Whether a parsed photo or video says stickers are on it. */
export const hasAttachedStickers = (media) => {
  if (media?.photo) {
    return media.photo.hasStickers === true;
  }
  const attrs = media?.document?.attributes;
  return (
    Array.isArray(attrs) &&
    attrs.some((a) => a?.className === 'DocumentAttributeHasStickers')
  );
};

/** The photo's `{ api, chat, msgId }` for the viewer's menu, else null. */
export const viewerStickers = (api, media, chat, msgId) =>
  hasAttachedStickers(media) &&
  typeof api?.telegramStickerAttached === 'function'
    ? { api, chat, msgId }
    : null;

/**
 * A small button over a video that has stickers on it; the dialog it
 * opens is drawn on the page's body.
 */
export const AttachedButton = ({ api, media, chat, msgId }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!Dialog || !viewerStickers(api, media, chat, msgId)) {
    return null;
  }
  return el(React.Fragment, null, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'attached-stickers-button',
        'data-action': 'attached-stickers',
        title: t('chat.extras.attached'),
        'aria-label': t('chat.extras.attached'),
        onClick: (event) => {
          event.stopPropagation();
          setOpen(true);
        },
      },
      '🏷'
    ),
    open
      ? el(Dialog, {
          key: 'd',
          api,
          chat,
          msgId,
          onClose: () => setOpen(false),
        })
      : null,
  ]);
};
