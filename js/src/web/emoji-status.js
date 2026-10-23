// A user's emoji status drawn after the name (R-Y162; learned, never
// copied): the custom emoji at the text's size, nothing once its time
// has passed. It stands where the Premium star would, as in Telegram's
// apps.

import React from 'react';
import { CustomEmoji } from './custom-emoji.js';
import { activeStatus } from './emoji-status-model.js';

const el = React.createElement;

/** The status `{ id, until? }` as a small custom emoji, or nothing. */
export const EmojiStatus = ({ status, api, nowMs = Date.now() }) => {
  const shown = activeStatus(status, nowMs);
  return shown
    ? el(
        'span',
        { className: 'emoji-status', 'data-emoji-status': shown.id },
        el(CustomEmoji, { id: shown.id, text: '⭐', api })
      )
    : null;
};
