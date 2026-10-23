// Paid reactions and paid media, as Telegram Desktop shows them (R-Y176;
// learned, never copied).
// - A channel post that allows paid reactions shows the ⭐ chip with its
//   count. A click opens a small dialog: a slider and a number for 1 to
//   2500 Stars, the balance, the top senders and "Send N ⭐". Only that
//   button sends (messages.sendPaidReaction); Telegram's refusals, such as
//   BALANCE_TOO_LOW, show as text.
// - A paid-media message shows its previews blurred with "Unlock for N ⭐".
//   The button opens a question with the price and the balance; paying
//   happens only on its confirmation. Once unlocked the real photos and
//   videos show through the usual media code (one item) or as a grid.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { overPage } from './paid-portal.js';
import { strippedJpegDataUrl } from './message-parts.js';
import { mediaSrc } from './media-src.js';
import { PAID_MAX, canAfford, clampPaid, starsText } from './stars-model.js';

const el = React.createElement;

const errorText = (t, code) => {
  const key = `chat.paid.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.paid.err.failed') : text;
};

/** The user's Stars, asked once: a number, or null while unknown. */
export const useBalance = (api) => {
  const [balance, setBalance] = useState(null);
  useEffect(() => {
    let live = true;
    api
      ?.telegramStarsStatus?.()
      .then((a) => live && a?.ok && setBalance(Number(a.balance) || 0))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api]);
  return balance;
};

export const Balance = ({ t, balance }) =>
  el(
    'p',
    { className: 'meta', 'data-stars-balance': balance ?? '' },
    balance === null
      ? t('chat.paid.balanceUnknown')
      : t('chat.paid.balance', { count: starsText(balance) })
  );

const Top = ({ t, top }) =>
  top.length > 0
    ? el('ul', { className: 'paid-top', 'data-paid-top': '' }, [
        ...top.map((one, index) =>
          el(
            'li',
            { key: index },
            `${
              one.mine
                ? t('chat.paid.you')
                : one.anonymous
                  ? t('chat.paid.anonymous')
                  : t('chat.paid.someone')
            }: ${one.count} ⭐`
          )
        ),
      ])
    : null;

const PaidReactionDialog = ({ api, chat, msgId, reaction, onClose }) => {
  const t = useT();
  const balance = useBalance(api);
  const [count, setCount] = useState(clampPaid(10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const send = async () => {
    setBusy(true);
    setError(null);
    const answer = await api
      .telegramPaidReaction({ chat, id: msgId, count })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      onClose();
    } else {
      setError(errorText(t, answer?.code ?? 'failed'));
    }
  };
  const poor = !canAfford(balance, count);
  return overPage(
    el(
      FormDialog,
      {
        name: 'paid-reaction',
        title: t('chat.paid.reactTitle'),
        onClose,
        onSubmit: send,
        submit: t('chat.paid.send', { count }),
        busy: busy || poor,
        error: error ?? (poor ? t('chat.paid.err.balance') : null),
        outside: true,
      },
      [
        el('p', { key: 'h', className: 'meta' }, t('chat.paid.reactHint')),
        el('input', {
          key: 'r',
          type: 'range',
          min: 1,
          max: PAID_MAX,
          value: count,
          'data-field': 'paid-range',
          'aria-label': t('chat.paid.amount'),
          onChange: (e) => setCount(clampPaid(e.target.value)),
        }),
        el('input', {
          key: 'n',
          type: 'number',
          min: 1,
          max: PAID_MAX,
          value: count,
          'data-field': 'paid-count',
          'aria-label': t('chat.paid.amount'),
          onChange: (e) => setCount(clampPaid(e.target.value)),
        }),
        el(Balance, { key: 'b', t, balance }),
        el(Top, { key: 't', t, top: reaction.top }),
      ]
    )
  );
};

/** The paid ⭐ chip with its count; a click opens the dialog. */
export const PaidReactionChip = ({ reaction, api, chat, msgId }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const usable =
    chat &&
    msgId &&
    typeof api?.telegramPaidReaction === 'function' &&
    typeof api?.telegramStarsStatus === 'function';
  return el(React.Fragment, null, [
    el(
      'button',
      {
        key: 'c',
        type: 'button',
        className: `bubble-reaction bubble-reaction-paid${reaction.mine > 0 ? ' mine' : ''}`,
        'data-paid-reaction': reaction.count,
        title: t('chat.paid.reactTitle'),
        disabled: !usable,
        onClick: () => setOpen(true),
      },
      `⭐ ${reaction.count}`
    ),
    open
      ? el(PaidReactionDialog, {
          key: 'd',
          api,
          chat: String(chat),
          msgId,
          reaction,
          onClose: () => setOpen(false),
        })
      : null,
  ]);
};

// ---- Paid media -----------------------------------------------------------

const ratioOf = (item) => (item.w > 0 && item.h > 0 ? item.w / item.h : 4 / 3);

const Preview = ({ item, count }) => {
  const url = item.thumb ? strippedJpegDataUrl(item.thumb) : null;
  return el(
    'span',
    {
      className: 'paid-preview',
      'data-paid-preview': '',
      style: {
        aspectRatio: String(ratioOf(item)),
        width: count > 1 ? 'calc(50% - 2px)' : '100%',
      },
    },
    url ? el('img', { src: url, alt: '', draggable: false }) : null
  );
};

const UnlockDialog = ({ api, chat, msgId, stars, onClose, onPaid }) => {
  const t = useT();
  const balance = useBalance(api);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pay = async () => {
    setBusy(true);
    setError(null);
    const answer = await api
      .telegramPaidMediaUnlock({ chat, id: msgId, stars })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      onPaid();
      onClose();
    } else {
      setError(errorText(t, answer?.code ?? 'failed'));
    }
  };
  const poor = !canAfford(balance, stars);
  return overPage(
    el(
      FormDialog,
      {
        name: 'paid-unlock',
        title: t('chat.paid.unlockTitle'),
        onClose,
        onSubmit: pay,
        submit: t('chat.paid.pay', { count: stars }),
        busy: busy || poor,
        error: error ?? (poor ? t('chat.paid.err.balance') : null),
        outside: true,
      },
      [
        el(
          'p',
          { key: 'p', 'data-paid-price': stars },
          t('chat.paid.unlockHint', { count: stars })
        ),
        el(Balance, { key: 'b', t, balance }),
      ]
    )
  );
};

// One unlocked item of several: its picture (a video's poster).
const Unlocked = ({ api, chat, msgId, index, item }) => {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    api
      ?.telegramMediaUrl?.({ chat, id: msgId, size: 'x', part: index })
      .then((url) => live && setSrc(url))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, chat, msgId, index]);
  const video = item.media?.className === 'MessageMediaDocument';
  return el('span', { className: 'paid-item', 'data-paid-item': index }, [
    src ? el('img', { key: 'i', ...mediaSrc(src), alt: '' }) : null,
    video ? el('span', { key: 'v', className: 'paid-play' }, '▶') : null,
  ]);
};

/** A paid-media message: blurred previews and Unlock, or the real items. */
export const PaidMedia = ({ media, api, chat, msgId }) => {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [paid, setPaid] = useState(false);
  const usable =
    chat && msgId && typeof api?.telegramPaidMediaUnlock === 'function';
  if (!media.locked) {
    return el(
      'div',
      { className: 'paid-media paid-open', 'data-paid-media': 'open' },
      media.items.map((item, index) =>
        el(Unlocked, {
          key: index,
          api,
          chat: String(chat),
          msgId,
          index,
          item,
        })
      )
    );
  }
  return el('div', { className: 'paid-media', 'data-paid-media': 'locked' }, [
    el(
      'div',
      { key: 'p', className: 'paid-previews' },
      media.items.map((item, index) =>
        el(Preview, { key: index, item, count: media.items.length })
      )
    ),
    paid
      ? el(
          'span',
          { key: 'd', className: 'paid-unlock', 'data-paid-done': '' },
          t('chat.paid.done')
        )
      : el(
          'button',
          {
            key: 'u',
            type: 'button',
            className: 'paid-unlock',
            'data-action': 'paid-unlock',
            disabled: !usable,
            onClick: () => setAsking(true),
          },
          t('chat.paid.unlock', { count: media.stars })
        ),
    asking
      ? el(UnlockDialog, {
          key: 'q',
          api,
          chat: String(chat),
          msgId,
          stars: media.stars,
          onClose: () => setAsking(false),
          onPaid: () => setPaid(true),
        })
      : null,
  ]);
};
