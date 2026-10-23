// Privacy → Messages → "Charge for messages" (R-Y184; learned, never
// copied), as Telegram Desktop has it: people who are not in your contacts
// pay Stars to write to you. A switch and a price (1 to 10000 Stars) —
// nothing is changed until Save, and every other privacy setting is kept as
// it is (account.setGlobalPrivacySettings with the settings read again).

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

/** The most Stars a message may cost (Telegram's usual limit). */
export const PRICE_MAX = 10_000;

/** The price typed, as a whole number from 1 to PRICE_MAX, or null. */
export const priceOf = (typed) => {
  const text = String(typed ?? '').trim();
  const n = /^\d{1,6}$/.test(text) ? Number(text) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= PRICE_MAX ? n : null;
};

const errorText = (t, code) => {
  const key = `chat.paidMsg.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.paidMsg.err.failed') : text;
};

const usePaidSettings = (api) => {
  const [state, setState] = useState({ phase: 'loading', stars: 0 });
  useEffect(() => {
    let live = true;
    Promise.resolve(api?.telegramPaidSettings?.())
      .then((answer) => {
        if (live) {
          setState(
            answer?.ok
              ? { phase: 'ready', stars: Number(answer.stars) || 0 }
              : { phase: 'error', stars: 0 }
          );
        }
      })
      .catch(() => live && setState({ phase: 'error', stars: 0 }));
    return () => {
      live = false;
    };
  }, [api]);
  return [state, setState];
};

/** The "Charge for messages" setting of the privacy dialog. */
export const PaidMessagesSetting = ({ api, setError }) => {
  const t = useT();
  const [state, setState] = usePaidSettings(api);
  const [on, setOn] = useState(null);
  const [typed, setTyped] = useState(null);
  const [busy, setBusy] = useState(false);
  if (state.phase !== 'ready') {
    return el(
      'p',
      { className: 'meta' },
      t(
        state.phase === 'error'
          ? 'chat.paidMsg.unavailable'
          : 'chat.paidMsg.loading'
      )
    );
  }
  const enabled = on ?? state.stars > 0;
  const text = typed ?? String(state.stars || 100);
  const price = enabled ? priceOf(text) : 0;
  const changed = enabled ? price !== state.stars : state.stars > 0;
  const save = async () => {
    setBusy(true);
    const answer = await Promise.resolve(
      api.telegramPaidSettingsSave({ stars: price })
    ).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setError(null);
      setState({ phase: 'ready', stars: price });
      setOn(null);
      setTyped(null);
    } else {
      setError(errorText(t, answer?.code ?? 'failed'));
    }
  };
  return el('div', { className: 'privacy-paid' }, [
    el('label', { key: 'o', className: 'privacy-switch' }, [
      el('input', {
        key: 'i',
        type: 'checkbox',
        role: 'switch',
        'data-field': 'paid-enabled',
        checked: enabled,
        disabled: busy,
        onChange: (e) => setOn(e.target.checked),
      }),
      el('span', { key: 's' }, t('chat.paidMsg.charge')),
      el('span', { key: 'h', className: 'meta' }, t('chat.paidMsg.chargeHint')),
    ]),
    enabled
      ? el('label', { key: 'p', className: 'chat-form-field' }, [
          el('span', { key: 'l' }, t('chat.paidMsg.price')),
          el('input', {
            key: 'n',
            type: 'number',
            inputMode: 'numeric',
            min: 1,
            max: PRICE_MAX,
            'data-field': 'paid-price',
            value: text,
            disabled: busy,
            onChange: (e) => setTyped(e.target.value),
          }),
          el(
            'small',
            { key: 'm', className: 'meta' },
            price === null
              ? t('chat.paidMsg.priceBad', { max: PRICE_MAX })
              : t('chat.paidMsg.priceHint', { count: price })
          ),
        ])
      : null,
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        'data-action': 'paid-save',
        disabled: busy || !changed || price === null,
        onClick: save,
      },
      t('chat.paidMsg.save')
    ),
  ]);
};
