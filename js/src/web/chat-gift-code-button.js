// The gift code's button in a chat (R-Y193; learned, never copied): a gift
// code's service line and a gift code sent as media offer "View gift code",
// which opens the dialog (chat-gift-unique.js). Apart from that file so the
// message cards need nothing heavy.

import React from 'react';
import { useT } from './i18n.js';
import { giftCodeSlugOf, openGiftCode } from './gift-manage-model.js';

const el = React.createElement;

const OpenCode = ({ t, slug }) =>
  slug
    ? el(
        'button',
        {
          type: 'button',
          className: 'gift-code-open',
          'data-action': 'gift-code-open',
          onClick: (event) => {
            event.stopPropagation();
            openGiftCode(slug);
          },
        },
        t('chat.giftManage.codeOpen')
      )
    : null;

/** The button of a gift code's service line (from the message's `raw`). */
export const GiftCodeLine = ({ raw }) =>
  el(OpenCode, { t: useT(), slug: giftCodeSlugOf(raw) });

/** A gift code sent as media. */
export const GiftCodeCard = ({ media }) => {
  const t = useT();
  return el('div', { className: 'bubble-card gift-code-card' }, [
    el(
      'strong',
      { key: 't' },
      t('chat.giftManage.codeMonths', { count: media.months })
    ),
    el(OpenCode, { key: 'o', t, slug: media.slug }),
  ]);
};
