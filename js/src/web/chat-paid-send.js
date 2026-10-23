// Writing in a chat that charges Stars per message, as Telegram Desktop
// shows it (R-Y184; learned, never copied): the box says "N ⭐ per message",
// and every send into the chat (text, files, voice, stickers, a forward…)
// first asks a question — "N ⭐ × M messages = T ⭐", your balance, and
// "Don't ask again for this chat" (kept in this browser, for that price) —
// and goes out with exactly T confirmed (./paid-send.js holds the rule).
// Cancelling sends nothing and pays nothing.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { Balance, useBalance } from './chat-paid.js';
import { overPage } from './paid-portal.js';
import { canAfford } from './stars-model.js';
import { bindPaid, paidGate } from './paid-send.js';

const el = React.createElement;

// A person or a supergroup can charge; a basic group or a channel cannot.
const CHARGING = /^(\d{1,20}|-100\d{1,20})$/;

/** Whether the chat may charge for messages (a Telegram person or group). */
export const mayCharge = (chat) =>
  chat?.source === 'telegram' &&
  chat.kind !== 'channel' &&
  CHARGING.test(String(chat.chat ?? ''));

const AskDialog = ({ api, offer, answer }) => {
  const t = useT();
  const balance = useBalance(api);
  const [remember, setRemember] = useState(false);
  const poor = !canAfford(balance, offer.total);
  return overPage(
    el(
      FormDialog,
      {
        name: 'paid-send',
        title: t('chat.paidSend.title'),
        onClose: () => answer({ confirmed: false }),
        onSubmit: () => answer({ confirmed: true, remember }),
        submit: t('chat.paidSend.confirm', { count: offer.total }),
        busy: poor,
        error: poor ? t('chat.paid.err.balance') : null,
        outside: true,
      },
      [
        el(
          'p',
          { key: 'p', 'data-paid-total': offer.total },
          t('chat.paidSend.body', {
            price: offer.price,
            count: offer.count,
            total: offer.total,
          })
        ),
        el(Balance, { key: 'b', t, balance }),
        el('label', { key: 'r', className: 'paid-remember' }, [
          el('input', {
            key: 'i',
            type: 'checkbox',
            'data-field': 'paid-remember',
            checked: remember,
            onChange: (event) => setRemember(event.target.checked),
          }),
          el('span', { key: 't' }, t('chat.paidSend.remember')),
        ]),
      ]
    )
  );
};

// The question waiting for the user, answered by the dialog (or by the
// box going away, which counts as "no").
const useAsks = () => {
  const [asks, setAsks] = useState([]);
  const open = useRef([]);
  useEffect(() => {
    const unbind = bindPaid({
      ask: (offer) =>
        new Promise((resolve) => {
          const entry = { offer, resolve };
          open.current = [...open.current, entry];
          setAsks(open.current);
        }),
    });
    return () => {
      unbind();
      for (const entry of open.current) {
        entry.resolve({ confirmed: false });
      }
      open.current = [];
    };
  }, []);
  const answer = (entry, value) => {
    open.current = open.current.filter((one) => one !== entry);
    setAsks(open.current);
    entry.resolve(value);
  };
  return { first: asks[0] ?? null, answer };
};

// What one message costs in the open chat: 0 until known.
const usePrice = (chat) => {
  const id = mayCharge(chat) ? String(chat.chat) : null;
  const [price, setPrice] = useState({ chat: null, stars: 0 });
  useEffect(() => {
    if (!id) {
      return undefined;
    }
    let live = true;
    paidGate
      .priceOf(id)
      .then((stars) => live && setPrice({ chat: id, stars }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  return price.chat === id ? price.stars : 0;
};

/**
 * The composer's part: `{ label, dialog }` — the "N ⭐ per message" line
 * above the box (null in a free chat) and the question before a send.
 */
export const usePaidSend = (api, chat) => {
  const t = useT();
  const stars = usePrice(chat);
  const { first, answer } = useAsks();
  return {
    stars,
    label:
      stars > 0
        ? el(
            'div',
            {
              key: 'paid-send',
              className: 'paid-send-label',
              'data-paid-per-message': stars,
            },
            t('chat.paidSend.perMessage', { count: stars })
          )
        : null,
    dialog: first
      ? el(AskDialog, {
          key: 'paid-ask',
          api,
          offer: first.offer,
          answer: (value) => answer(first, value),
        })
      : null,
  };
};
