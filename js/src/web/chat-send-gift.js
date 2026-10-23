// "Send a gift" on a person's profile, as Telegram Desktop has it (R-Y185;
// learned, never copied). The button opens the catalogue: each gift's
// sticker and price in Stars, with "Limited" (and how many are left) and
// "Sold out" marks; a sold-out gift cannot be picked. A picked gift opens
// a message (up to 255 characters) and "Hide my name"; Continue asks the
// last question: the gift, the price and the balance. Only its Pay button
// pays (the server asks Telegram for the payment form and refuses when its
// price is not the one shown). Telegram's refusals show as words.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { Picture } from './chat-stickers.js';
import { useBalance } from './chat-paid.js';
import { canAfford, starsText } from './stars-model.js';
import { catalogueOrder, giftText } from './profile-stories-model.js';

const el = React.createElement;

const TEXT_MAX = 255;

const errorText = (t, code) => {
  const key = `chat.sendGift.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.sendGift.err.failed') : text;
};

/** Whether a chat's info column offers a gift: a Telegram person. */
export const canSendGift = (chat, api) =>
  chat?.source === 'telegram' &&
  /^\d+$/.test(String(chat.chat)) &&
  typeof api?.telegramGiftCatalogue === 'function' &&
  typeof api?.telegramGiftSend === 'function';

// The catalogue, asked when the dialog opens.
const useCatalogue = (api) => {
  const [state, setState] = useState({ gifts: [], busy: true, code: null });
  useEffect(() => {
    let live = true;
    Promise.resolve(api.telegramGiftCatalogue({}))
      .catch(() => null)
      .then(
        (answer) =>
          live &&
          setState(
            answer?.ok
              ? { gifts: catalogueOrder(answer.gifts), busy: false, code: null }
              : { gifts: [], busy: false, code: answer?.code ?? 'failed' }
          )
      );
    return () => {
      live = false;
    };
  }, [api]);
  return state;
};

const Marks = ({ t, gift }) => {
  const marks = [
    gift.soldOut ? t('chat.sendGift.soldOut') : null,
    gift.limited && !gift.soldOut
      ? t('chat.sendGift.left', { count: gift.remains })
      : null,
    gift.limited && !gift.soldOut ? t('chat.sendGift.limited') : null,
    gift.premium ? t('chat.sendGift.premium') : null,
  ].filter(Boolean);
  return marks.length > 0
    ? el('span', { className: 'meta gift-marks' }, marks.join(' · '))
    : null;
};

const Card = ({ api, t, gift, picked, onPick }) =>
  el(
    'button',
    {
      type: 'button',
      className: `gift-cell${picked ? ' picked' : ''}${gift.soldOut ? ' hidden-gift' : ''}`,
      'data-gift-card': gift.id,
      'data-sold-out': gift.soldOut ? 'true' : 'false',
      'aria-pressed': picked,
      disabled: gift.soldOut,
      onClick: onPick,
    },
    [
      gift.sticker
        ? el(Picture, { key: 's', api, item: gift.sticker })
        : el('span', { key: 's', className: 'sticker-empty' }, '🎁'),
      el('span', { key: 'v', className: 'gift-stars' }, `${gift.stars} ⭐`),
      el(Marks, { key: 'm', t, gift }),
    ]
  );

// The first step: the catalogue, then the message and "Hide my name".
const Pick = ({ api, name, form, setForm, onNext, onClose }) => {
  const t = useT();
  const catalogue = useCatalogue(api);
  const gift = catalogue.gifts.find((g) => g.id === form.gift) ?? null;
  const error = catalogue.code ? errorText(t, catalogue.code) : null;
  return el(
    FormDialog,
    {
      name: 'gift-pick',
      title: t('chat.sendGift.title', { name }),
      onClose,
      onSubmit: () => gift && onNext(gift),
      submit: t('chat.sendGift.continue'),
      busy: !gift,
      error,
      outside: true,
    },
    [
      catalogue.busy
        ? el('p', { key: 'b', className: 'meta' }, t('chat.sendGift.loading'))
        : null,
      el(
        'div',
        { key: 'g', className: 'gift-grid', 'data-gift-catalogue': '' },
        catalogue.gifts.map((one) =>
          el(Card, {
            key: one.id,
            api,
            t,
            gift: one,
            picked: one.id === form.gift,
            onPick: () => setForm({ ...form, gift: one.id }),
          })
        )
      ),
      gift
        ? el('textarea', {
            key: 't',
            value: form.text,
            maxLength: TEXT_MAX,
            rows: 3,
            'data-field': 'gift-text',
            'aria-label': t('chat.sendGift.message'),
            placeholder: t('chat.sendGift.message'),
            onChange: (e) => setForm({ ...form, text: e.target.value }),
          })
        : null,
      gift
        ? el('label', { key: 'h', className: 'check-row' }, [
            el('input', {
              key: 'i',
              type: 'checkbox',
              checked: form.hideName,
              'data-field': 'gift-hide-name',
              onChange: (e) => setForm({ ...form, hideName: e.target.checked }),
            }),
            ' ',
            t('chat.sendGift.hideName'),
          ])
        : null,
    ]
  );
};

// The last question: only Pay pays.
const Confirm = ({ api, chat, name, gift, form, onBack, onDone }) => {
  const t = useT();
  const balance = useBalance(api);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const text = giftText(form.text, TEXT_MAX);
  const pay = async () => {
    setBusy(true);
    setError(null);
    const answer = await Promise.resolve(
      api.telegramGiftSend({
        chat,
        gift: gift.id,
        stars: gift.stars,
        ...(text ? { text } : {}),
        ...(form.hideName ? { hideName: true } : {}),
      })
    ).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      onDone();
    } else {
      setError(
        answer?.code === 'cannot' && answer.error
          ? answer.error
          : errorText(t, answer?.code ?? 'failed')
      );
    }
  };
  const poor = !canAfford(balance, gift.stars);
  return el(
    FormDialog,
    {
      name: 'gift-confirm',
      title: t('chat.sendGift.confirmTitle'),
      onClose: onBack,
      onSubmit: pay,
      submit: t('chat.sendGift.pay', { count: gift.stars }),
      busy: busy || poor,
      error: error ?? (poor ? errorText(t, 'balance') : null),
      outside: true,
    },
    [
      el(
        'p',
        { key: 'p', 'data-gift-price': gift.stars },
        t('chat.sendGift.confirmText', {
          title: gift.title || t('chat.stars.gift'),
          name,
          count: gift.stars,
        })
      ),
      text ? el('p', { key: 'm', className: 'gift-text' }, text) : null,
      form.hideName
        ? el('p', { key: 'h', className: 'meta' }, t('chat.sendGift.hidden'))
        : null,
      el(
        'p',
        { key: 'b', className: 'meta', 'data-stars-balance': balance ?? '' },
        balance === null
          ? t('chat.paid.balanceUnknown')
          : t('chat.paid.balance', { count: starsText(balance) })
      ),
    ]
  );
};

const Dialog = ({ api, chat, name, onClose, onSent }) => {
  const [form, setForm] = useState({ gift: '', text: '', hideName: false });
  const [step, setStep] = useState(null); // the gift being confirmed
  const dialog = step
    ? el(Confirm, {
        api,
        chat,
        name,
        gift: step,
        form,
        onBack: () => setStep(null),
        onDone: () => {
          onSent();
          onClose();
        },
      })
    : el(Pick, {
        api,
        name,
        form,
        setForm,
        onNext: setStep,
        onClose,
      });
  const body = globalThis.document?.body;
  const stop = (event) => event.stopPropagation();
  const wrapped = el(
    'div',
    { className: 'paid-portal', onClick: stop },
    dialog
  );
  return body ? createPortal(wrapped, body) : wrapped;
};

const Button = ({ api, chat, name }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  return el('section', { className: 'person-section' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        'data-action': 'send-gift',
        onClick: () => {
          setSent(false);
          setOpen(true);
        },
      },
      t('chat.sendGift.button')
    ),
    sent
      ? el(
          'p',
          { key: 's', className: 'meta', role: 'status', 'data-gift-sent': '' },
          t('chat.sendGift.sent', { name })
        )
      : null,
    open
      ? el(Dialog, {
          key: 'd',
          api,
          chat,
          name,
          onClose: () => setOpen(false),
          onSent: () => setSent(true),
        })
      : null,
  ]);
};

/** "Send a gift" in a person's info column. */
export const SendGiftRow = ({ api, chat }) =>
  canSendGift(chat, api)
    ? el(Button, {
        api,
        chat: String(chat.chat),
        name: String(chat.name ?? ''),
      })
    : null;
