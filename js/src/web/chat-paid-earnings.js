// What a person's messages earned, in their profile (R-Y184; learned, never
// copied), as Telegram Desktop shows it for paid messages: when people who
// are not in your contacts pay Stars to write to you, the profile of one of
// them says how much you earned from them (account.getPaidMessagesRevenue).
// Two actions, each behind its own confirmation in the page: let the person
// write for free from now on (optionally giving back what they paid), or
// make them pay again (account.toggleNoPaidMessagesException).

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

const errorText = (t, code) => {
  const key = `chat.paidMsg.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.paidMsg.err.failed') : text;
};

/** Whether the profile is of a person who can be asked about (a user). */
export const isPerson = (chat) =>
  chat?.source === 'telegram' && /^\d{1,20}$/.test(String(chat.chat ?? ''));

const useRevenue = (api, chat) => {
  const user = isPerson(chat) ? String(chat.chat) : null;
  const [stars, setStars] = useState(0);
  useEffect(() => {
    setStars(0);
    if (!user || typeof api?.telegramPaidRevenue !== 'function') {
      return undefined;
    }
    let live = true;
    Promise.resolve(api.telegramPaidRevenue({ user }))
      .then((answer) => live && answer?.ok && setStars(answer.stars))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, user]);
  return { user, stars };
};

const Asking = ({ t, allow, refund, setRefund, busy, onYes, onNo }) =>
  el(
    'div',
    { className: 'paid-earn-ask', 'data-paid-ask': allow ? 'free' : 'pay' },
    [
      el(
        'p',
        { key: 'q' },
        t(allow ? 'chat.paidMsg.freeAsk' : 'chat.paidMsg.payAsk')
      ),
      allow
        ? el('label', { key: 'r', className: 'paid-remember' }, [
            el('input', {
              key: 'i',
              type: 'checkbox',
              'data-field': 'paid-refund',
              checked: refund,
              onChange: (e) => setRefund(e.target.checked),
            }),
            el('span', { key: 't' }, t('chat.paidMsg.refund')),
          ])
        : null,
      el('div', { key: 'b', className: 'settings-buttons' }, [
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: 'primary',
            'data-action': 'paid-confirm',
            disabled: busy,
            onClick: onYes,
          },
          t('chat.paidMsg.confirm')
        ),
        el(
          'button',
          {
            key: 'n',
            type: 'button',
            'data-action': 'paid-cancel',
            onClick: onNo,
          },
          t('chat.create.cancel')
        ),
      ]),
    ]
  );

/** The earnings row of a person's profile; nothing when there are none. */
export const PaidEarnings = ({ api, chat }) => {
  const t = useT();
  const { user, stars } = useRevenue(api, chat);
  const [asking, setAsking] = useState(null); // 'free' | 'pay'
  const [refund, setRefund] = useState(false);
  const [state, setState] = useState({ busy: false, done: null, error: null });
  if (!user || stars <= 0) {
    return null;
  }
  const run = async () => {
    setState({ busy: true, done: null, error: null });
    const allow = asking === 'free';
    const answer = await Promise.resolve(
      api.telegramPaidException({
        user,
        allow,
        ...(allow && refund ? { refund } : {}),
      })
    ).catch(() => null);
    setAsking(null);
    setState(
      answer?.ok
        ? { busy: false, done: allow ? 'free' : 'pay', error: null }
        : { busy: false, done: null, error: answer?.code ?? 'failed' }
    );
  };
  return el('div', { className: 'paid-earnings', 'data-paid-earned': stars }, [
    el('strong', { key: 't' }, t('chat.paidMsg.earned', { count: stars })),
    asking
      ? el(Asking, {
          key: 'a',
          t,
          allow: asking === 'free',
          refund,
          setRefund,
          busy: state.busy,
          onYes: run,
          onNo: () => setAsking(null),
        })
      : el('div', { key: 'b', className: 'settings-buttons' }, [
          el(
            'button',
            {
              key: 'f',
              type: 'button',
              'data-action': 'paid-free',
              onClick: () => setAsking('free'),
            },
            t('chat.paidMsg.free')
          ),
          el(
            'button',
            {
              key: 'p',
              type: 'button',
              'data-action': 'paid-pay',
              onClick: () => setAsking('pay'),
            },
            t('chat.paidMsg.pay')
          ),
        ]),
    state.done
      ? el(
          'p',
          { key: 'd', className: 'meta', 'data-paid-done': state.done },
          t(
            state.done === 'free'
              ? 'chat.paidMsg.nowFree'
              : 'chat.paidMsg.nowPay'
          )
        )
      : null,
    state.error
      ? el(
          'p',
          { key: 'e', className: 'chat-form-error', role: 'alert' },
          errorText(t, state.error)
        )
      : null,
  ]);
};
