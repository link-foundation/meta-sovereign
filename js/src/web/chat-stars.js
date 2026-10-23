// Telegram Stars, as Telegram Desktop shows them (R-Y176; learned, never
// copied).
// - Settings, in the profile card: "Telegram Stars" shows the balance and
//   the history (All, Incoming and Outgoing tabs, a page at a time). Each
//   row has where it came from (a person, Fragment, App Store, the Premium
//   bot, a gift, a reaction, paid media), the title, the date and the
//   amount with its sign; a refunded row says so. Stars are bought in the
//   official apps, and the dialog says so.
// - A person's info column shows their "Gifts" when they have any: a grid
//   of the gift's sticker, who sent it (unless anonymous), the date and the
//   Stars value. A click opens the gift. The user's own gifts can be hidden
//   from or shown on the profile: that click is the only write.

import React, { useEffect, useRef, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { Picture } from './chat-stickers.js';
import { rowLabel, signedStars, sourceKey, starsText } from './stars-model.js';

const el = React.createElement;

const errorText = (t, code) => {
  const key = `chat.stars.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.stars.err.failed') : text;
};

const TABS = ['all', 'in', 'out'];

// The history of one tab, a page at a time.
const useHistory = (api, filter) => {
  const [state, setState] = useState({
    rows: [],
    next: null,
    balance: null,
    busy: true,
    code: null,
    filter,
  });
  const latest = useRef(0);
  const load = (offset) => {
    const mine = ++latest.current;
    setState((s) => ({ ...s, busy: true, code: null }));
    return api
      .telegramStarsHistory({ filter, ...(offset ? { offset } : {}) })
      .catch(() => null)
      .then((answer) => {
        if (mine !== latest.current) {
          return;
        }
        setState((s) =>
          answer?.ok
            ? {
                rows: offset
                  ? [...s.rows, ...answer.transactions]
                  : answer.transactions,
                next: answer.next,
                balance: answer.balance,
                busy: false,
                code: null,
                filter,
              }
            : { ...s, busy: false, code: answer?.code ?? 'failed' }
        );
      });
  };
  useEffect(() => {
    setState((s) => ({ ...s, rows: [], next: null }));
    load(null);
  }, [api, filter]);
  return [state, load];
};

const Row = ({ row, t, dateTime }) => {
  const label = rowLabel(row);
  const from = sourceKey(row);
  const place = from ? t(from) : row.source.name;
  return el(
    'li',
    {
      className: 'stars-row',
      'data-stars-row': row.id,
      'data-refund': row.refund ? 'true' : undefined,
    },
    [
      el('div', { key: 'l', className: 'stars-row-text' }, [
        el('strong', { key: 't' }, label.key ? t(label.key) : label.text),
        el(
          'span',
          { key: 'm', className: 'meta' },
          [place, dateTime(row.date * 1000)].filter(Boolean).join(' · ')
        ),
        row.refund
          ? el(
              'span',
              { key: 'r', className: 'stars-tag', 'data-stars-refund': '' },
              t('chat.stars.refunded')
            )
          : null,
        row.failed
          ? el(
              'span',
              { key: 'f', className: 'stars-tag' },
              t('chat.stars.failed')
            )
          : null,
        row.pending
          ? el(
              'span',
              { key: 'p', className: 'stars-tag' },
              t('chat.stars.pending')
            )
          : null,
      ]),
      el(
        'span',
        {
          key: 'a',
          className: `stars-amount ${row.amount < 0 ? 'out' : 'in'}`,
          'data-stars-amount': row.amount,
        },
        `${signedStars(row.amount)} ⭐`
      ),
    ]
  );
};

const Tabs = ({ t, filter, onPick }) =>
  el(
    'div',
    { className: 'stars-tabs', role: 'tablist' },
    TABS.map((tab) =>
      el(
        'button',
        {
          key: tab,
          type: 'button',
          role: 'tab',
          'aria-selected': filter === tab,
          className: filter === tab ? 'active' : undefined,
          'data-stars-tab': tab,
          onClick: () => onPick(tab),
        },
        t(`chat.stars.tab.${tab}`)
      )
    )
  );

/** Settings → Telegram Stars: the balance and the history. */
export const StarsDialog = ({ api, close }) => {
  const t = useT();
  const { dateTime } = useDates();
  const [filter, setFilter] = useState('all');
  const [state, load] = useHistory(api, filter);
  const [balance, setBalance] = useState(null);
  useEffect(() => {
    let live = true;
    api
      .telegramStarsStatus()
      .then((a) => live && a?.ok && setBalance(a.balance))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api]);
  const shown = balance ?? state.balance;
  return el(
    Frame,
    { title: t('chat.stars.title'), close, name: 'stars' },
    el('div', { className: 'admin-body stars-body' }, [
      el(
        'p',
        {
          key: 'b',
          className: 'stars-balance',
          'data-stars-balance': shown ?? '',
        },
        [
          el('span', { key: 'l', className: 'meta' }, t('chat.stars.balance')),
          el(
            'strong',
            { key: 'n' },
            shown === null ? '…' : `${starsText(shown)} ⭐`
          ),
        ]
      ),
      el('p', { key: 'n', className: 'meta' }, t('chat.stars.buyNote')),
      el(Tabs, { key: 't', t, filter, onPick: setFilter }),
      el(
        'ul',
        { key: 'l', className: 'stars-list' },
        state.rows.map((row, index) =>
          el(Row, { key: `${row.id}:${index}`, row, t, dateTime })
        )
      ),
      !state.busy && !state.code && state.rows.length === 0
        ? el('p', { key: 'e', className: 'meta' }, t('chat.stars.empty'))
        : null,
      state.busy
        ? el('p', { key: 'w', className: 'meta' }, t('chat.stars.loading'))
        : null,
      state.code
        ? el(
            'p',
            { key: 'x', className: 'comments-failed', role: 'alert' },
            errorText(t, state.code)
          )
        : null,
      state.next && !state.busy
        ? el(
            'button',
            {
              key: 'm',
              type: 'button',
              'data-action': 'stars-more',
              onClick: () => load(state.next),
            },
            t('chat.stars.more')
          )
        : null,
    ])
  );
};

// ---- Gifts on a profile ---------------------------------------------------

/** Whether a chat's info column may show gifts: a Telegram person. */
export const hasGifts = (chat, api) =>
  chat?.source === 'telegram' &&
  /^\d+$/.test(String(chat.chat)) &&
  typeof api?.telegramStarGifts === 'function';

/** The key a gift is told apart by in a list. */
export const giftKey = (gift, index) =>
  `${gift.msgId || gift.savedId || 'g'}:${index}`;

// The person's gifts, a page at a time.
const useGifts = (api, chat) => {
  const [state, setState] = useState({
    gifts: [],
    next: null,
    count: 0,
    mine: false,
    busy: true,
    code: null,
  });
  const load = (offset) => {
    setState((s) => ({ ...s, busy: true, code: null }));
    return api
      .telegramStarGifts({ chat, ...(offset ? { offset } : {}) })
      .catch(() => null)
      .then((answer) =>
        setState((s) =>
          answer?.ok
            ? {
                gifts: offset ? [...s.gifts, ...answer.gifts] : answer.gifts,
                next: answer.next,
                count: answer.count,
                mine: answer.mine,
                busy: false,
                code: null,
              }
            : { ...s, busy: false, code: answer?.code ?? 'failed' }
        )
      );
  };
  useEffect(() => {
    setState((s) => ({ ...s, gifts: [], next: null, count: 0 }));
    load(null);
  }, [api, chat]);
  return [state, load, setState];
};

const Sticker = ({ api, gift }) =>
  gift.sticker
    ? el(Picture, { api, item: gift.sticker })
    : el('span', { className: 'sticker-empty' }, '🎁');

const Cell = ({ gift, api, t, dateTime, onOpen }) =>
  el(
    'button',
    {
      type: 'button',
      className: `gift-cell${gift.hidden ? ' hidden-gift' : ''}`,
      'data-gift': gift.msgId || gift.savedId,
      onClick: onOpen,
    },
    [
      el(Sticker, { key: 's', api, gift }),
      el('span', { key: 'v', className: 'gift-stars' }, `${gift.stars} ⭐`),
      el(
        'span',
        { key: 'f', className: 'meta gift-from' },
        gift.anonymous ? t('chat.stars.anonymous') : gift.fromName
      ),
      el('span', { key: 'd', className: 'meta' }, dateTime(gift.date * 1000)),
    ]
  );

const GiftDetail = ({ gift, mine, api, chat, onClose, onChanged }) => {
  const t = useT();
  const { dateTime } = useDates();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(null);
  const toggle = async () => {
    setBusy(true);
    setCode(null);
    const answer = await api
      .telegramStarGiftSave({
        chat,
        msgId: gift.msgId,
        unsave: !gift.hidden,
      })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      onChanged(answer.hidden);
    } else {
      setCode(answer?.code ?? 'failed');
    }
  };
  return el(
    Frame,
    { title: gift.title || t('chat.stars.gift'), close: onClose, name: 'gift' },
    el('div', { className: 'admin-body gift-detail' }, [
      el(
        'div',
        { key: 's', className: 'gift-big' },
        el(Sticker, { api, gift })
      ),
      el(
        'p',
        { key: 'v', 'data-gift-stars': gift.stars },
        t('chat.stars.giftValue', { count: gift.stars })
      ),
      el(
        'p',
        { key: 'f', className: 'meta' },
        gift.anonymous
          ? t('chat.stars.fromAnonymous')
          : t('chat.stars.from', { name: gift.fromName })
      ),
      el('p', { key: 'd', className: 'meta' }, dateTime(gift.date * 1000)),
      gift.text
        ? el('p', { key: 't', className: 'gift-text' }, gift.text)
        : null,
      gift.hidden
        ? el(
            'p',
            { key: 'h', className: 'meta', 'data-gift-hidden': '' },
            t('chat.stars.hiddenNote')
          )
        : null,
      code
        ? el(
            'p',
            { key: 'e', className: 'comments-failed', role: 'alert' },
            errorText(t, code)
          )
        : null,
      mine && gift.msgId
        ? el(
            'button',
            {
              key: 'b',
              type: 'button',
              'data-action': 'gift-toggle',
              disabled: busy,
              onClick: toggle,
            },
            gift.hidden ? t('chat.stars.show') : t('chat.stars.hide')
          )
        : null,
    ])
  );
};

const GiftsSection = ({ api, chat }) => {
  const t = useT();
  const { dateTime } = useDates();
  const [state, load, setState] = useGifts(api, chat);
  const [open, setOpen] = useState(null);
  const gift = open === null ? null : state.gifts[open];
  if (state.gifts.length === 0) {
    return null;
  }
  return el('section', { className: 'person-section' }, [
    el('h3', { key: 'h' }, t('chat.stars.gifts')),
    el('div', { key: 'b', className: 'gifts', 'data-gifts': state.count }, [
      el(
        'div',
        { key: 'g', className: 'gift-grid' },
        state.gifts.map((one, index) =>
          el(Cell, {
            key: giftKey(one, index),
            gift: one,
            api,
            t,
            dateTime,
            onOpen: () => setOpen(index),
          })
        )
      ),
      state.code
        ? el(
            'p',
            { key: 'e', className: 'comments-failed', role: 'alert' },
            errorText(t, state.code)
          )
        : null,
      state.next && !state.busy
        ? el(
            'button',
            {
              key: 'm',
              type: 'button',
              'data-action': 'gifts-more',
              onClick: () => load(state.next),
            },
            t('chat.stars.more')
          )
        : null,
      gift
        ? el(GiftDetail, {
            key: 'd',
            gift,
            mine: state.mine,
            api,
            chat,
            onClose: () => setOpen(null),
            onChanged: (hidden) =>
              setState((s) => ({
                ...s,
                gifts: s.gifts.map((g, i) =>
                  i === open ? { ...g, hidden } : g
                ),
              })),
          })
        : null,
    ]),
  ]);
};

/** The person's gifts in the info column, or nothing without any. */
export const GiftsRow = ({ api, chat }) =>
  hasGifts(chat, api)
    ? el(GiftsSection, { api, chat: String(chat.chat) })
    : null;
