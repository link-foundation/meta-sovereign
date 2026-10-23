// One thread of a channel's direct messages, as Telegram's apps show it
// (R-Y191; learned, never copied): the messages, a suggested post as a
// card (price, date, status) with Approve and Decline for an admin, the
// suggested-post service messages as text, and a box to write in. The
// subscriber's box has an attach menu with "Suggest a post". A write
// happens only on its own click: Approve asks "Approve this post for N ⭐?"
// first, Decline takes an optional comment.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { paidGate } from './paid-send.js';
import {
  approveQuestion,
  canDecide,
  cardOf,
  decideBody,
  errorText,
  perMessageNote,
  priceText,
  replyBody,
  serviceText,
  suggestBody,
} from './channel-dm-model.js';

const el = React.createElement;

const newClientId = () =>
  globalThis.crypto?.randomUUID?.() ?? `dm${Date.now()}${Math.random()}`;

const useHistory = (api, chat, peer) => {
  const [state, setState] = useState({ phase: 'loading', messages: [] });
  const load = useCallback(async () => {
    const answer = await api
      .telegramChannelDmHistory({ chat, ...(peer ? { peer } : {}) })
      .catch(() => null);
    setState(
      answer?.ok
        ? { phase: 'ready', messages: answer.messages ?? [] }
        : { phase: 'error', code: answer?.code, messages: [] }
    );
  }, [api, chat, peer]);
  useEffect(() => {
    setState({ phase: 'loading', messages: [] });
    load();
  }, [load]);
  return [state, load];
};

const Card = ({ message, t, when, children }) => {
  const card = cardOf(message);
  return el('div', { className: 'dm-card', 'data-dm-card': card.status }, [
    el('strong', { key: 'h', className: 'dm-card-title' }, t('chat.dm.card')),
    el('div', { key: 'p', className: 'dm-card-row' }, [
      el('span', { key: 'l' }, t('chat.dm.cardPrice')),
      el(
        'span',
        { key: 'v', 'data-dm-price': true },
        priceText(card.price) || t('chat.dm.cardFree')
      ),
    ]),
    card.at
      ? el('div', { key: 'd', className: 'dm-card-row' }, [
          el('span', { key: 'l' }, t('chat.dm.cardDate')),
          el('span', { key: 'v' }, when(card.at)),
        ])
      : null,
    el(
      'span',
      { key: 's', className: 'dm-card-status', 'data-dm-status': card.status },
      t(`chat.dm.status.${card.status}`)
    ),
    children,
  ]);
};

const Decision = ({ message, t, decision, busy, onPick, onSend, onCancel }) => {
  const [comment, setComment] = useState('');
  if (decision?.id !== message.id) {
    return el('div', { className: 'dm-card-actions' }, [
      el(
        'button',
        {
          key: 'a',
          type: 'button',
          className: 'button',
          'data-action': 'dm-approve',
          onClick: () => onPick({ id: message.id, approve: true }),
        },
        t('chat.dm.approve')
      ),
      el(
        'button',
        {
          key: 'd',
          type: 'button',
          className: 'button',
          'data-action': 'dm-decline',
          onClick: () => onPick({ id: message.id, approve: false }),
        },
        t('chat.dm.decline')
      ),
    ]);
  }
  return el('div', { className: 'dm-ask', 'data-dm-ask': true }, [
    decision.approve
      ? el('p', { key: 'q' }, approveQuestion(t, message))
      : el('textarea', {
          key: 'c',
          className: 'dm-comment',
          'data-dm-comment': true,
          rows: 2,
          placeholder: t('chat.dm.declineComment'),
          value: comment,
          onChange: (e) => setComment(e.target.value),
        }),
    el('div', { key: 'b', className: 'dm-card-actions' }, [
      el(
        'button',
        {
          key: 'ok',
          type: 'button',
          className: 'button',
          disabled: busy,
          'data-action': decision.approve
            ? 'dm-approve-confirm'
            : 'dm-decline-confirm',
          onClick: () => onSend(comment),
        },
        decision.approve ? t('chat.dm.approve') : t('chat.dm.decline')
      ),
      el(
        'button',
        {
          key: 'no',
          type: 'button',
          className: 'button',
          'data-action': 'dm-ask-cancel',
          onClick: onCancel,
        },
        t('chat.dm.cancel')
      ),
    ]),
  ]);
};

const Bubble = ({ message, admin, t, when, decide }) => {
  const text = message.service ? serviceText(t, message.service, when) : null;
  if (text) {
    return el(
      'div',
      { className: 'dm-service', 'data-dm-service': message.id },
      text
    );
  }
  return el(
    'div',
    {
      className: message.out ? 'dm-message is-out' : 'dm-message',
      'data-dm-message': message.id,
    },
    [
      !message.out && message.name
        ? el('strong', { key: 'n', className: 'dm-name' }, message.name)
        : null,
      message.text
        ? el('div', { key: 't', className: 'dm-text' }, message.text)
        : null,
      cardOf(message)
        ? el(
            Card,
            { key: 'c', message, t, when },
            canDecide(message, admin)
              ? el(Decision, { message, t, ...decide })
              : null
          )
        : null,
      message.at
        ? el('span', { key: 'a', className: 'dm-time meta' }, when(message.at))
        : null,
    ]
  );
};

const SuggestForm = ({ t, onSend, onCancel, busy }) => {
  const [price, setPrice] = useState('0');
  const [date, setDate] = useState('');
  return el('div', { className: 'dm-suggest', 'data-dm-suggest': true }, [
    el('label', { key: 'p' }, [
      el('span', { key: 'l' }, t('chat.dm.suggestPrice')),
      el('input', {
        key: 'i',
        type: 'number',
        min: 0,
        step: 1,
        value: price,
        'data-dm-suggest-price': true,
        onChange: (e) => setPrice(e.target.value),
      }),
    ]),
    el('label', { key: 'd' }, [
      el('span', { key: 'l' }, t('chat.dm.suggestDate')),
      el('input', {
        key: 'i',
        type: 'datetime-local',
        value: date,
        'data-dm-suggest-date': true,
        onChange: (e) => setDate(e.target.value),
      }),
    ]),
    el('div', { key: 'b', className: 'dm-card-actions' }, [
      el(
        'button',
        {
          key: 'ok',
          type: 'button',
          className: 'button',
          disabled: busy,
          'data-action': 'dm-suggest-send',
          onClick: () => onSend({ price, date }),
        },
        t('chat.dm.suggestSend')
      ),
      el(
        'button',
        {
          key: 'no',
          type: 'button',
          className: 'button',
          'data-action': 'dm-suggest-cancel',
          onClick: onCancel,
        },
        t('chat.dm.cancel')
      ),
    ]),
  ]);
};

// The box: text, Send, and for a subscriber the attach menu.
const Composer = ({ t, admin, stars, busy, onSend, onSuggest }) => {
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const note = admin ? null : perMessageNote(t, stars);
  return el('div', { className: 'dm-composer' }, [
    suggesting
      ? el(SuggestForm, {
          key: 's',
          t,
          busy,
          onCancel: () => setSuggesting(false),
          onSend: async (fields) => {
            if (await onSuggest({ text, ...fields })) {
              setText('');
              setSuggesting(false);
            }
          },
        })
      : null,
    menu
      ? el('div', { key: 'm', className: 'dm-attach-menu', role: 'menu' }, [
          el(
            'button',
            {
              key: 'sg',
              type: 'button',
              role: 'menuitem',
              className: 'dm-attach-item',
              'data-action': 'dm-suggest',
              onClick: () => {
                setMenu(false);
                setSuggesting(true);
              },
            },
            t('chat.dm.suggest')
          ),
        ])
      : null,
    el('div', { key: 'r', className: 'dm-composer-row' }, [
      admin
        ? null
        : el(
            'button',
            {
              key: 'at',
              type: 'button',
              className: 'icon-btn',
              'data-action': 'dm-attach',
              'aria-label': t('chat.dm.attach'),
              title: t('chat.dm.attach'),
              onClick: () => setMenu((open) => !open),
            },
            '+'
          ),
      el('textarea', {
        key: 'in',
        className: 'dm-input',
        'data-dm-input': true,
        rows: 2,
        placeholder: t('chat.dm.placeholder'),
        value: text,
        onChange: (e) => setText(e.target.value),
      }),
      el(
        'button',
        {
          key: 'go',
          type: 'button',
          className: 'button',
          disabled: busy || text.trim() === '',
          'data-action': 'dm-send',
          onClick: async () => {
            if (await onSend(text)) {
              setText('');
            }
          },
        },
        t('chat.dm.send')
      ),
    ]),
    note
      ? el(
          'p',
          { key: 'n', className: 'dm-note meta', 'data-dm-note': true },
          note
        )
      : null,
  ]);
};

/**
 * A thread of the monoforum `chat`: `peer` the subscriber an admin
 * answers (none for the subscriber's own thread); `stars` what one
 * message costs the sender.
 */
export const DmThread = ({ api, chat, peer = null, admin, stars = 0 }) => {
  const t = useT();
  const { dateTime } = useDates();
  const [history, reload] = useHistory(api, chat, peer);
  const [decision, setDecision] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [history.messages.length]);

  // One write: the answer's failure shown as words, else the thread again.
  const write = async (call) => {
    setBusy(true);
    setError(null);
    const answer = await call().catch(() => null);
    setBusy(false);
    if (answer?.ok || answer?.status === 'sent') {
      await reload();
      return true;
    }
    setError(answer?.code ?? 'failed');
    return false;
  };

  // What the user confirmed paying for one message here (R-Y184's gate:
  // asked first, "don't ask again" kept per chat and price), 0 when free,
  // null when not confirmed — then nothing is sent.
  const confirmed = async () => {
    if (admin || stars <= 0) {
      return 0;
    }
    paidGate.note(chat, stars);
    const verdict = await paidGate.confirm(chat, 1);
    return verdict.ok ? verdict.stars : null;
  };

  const sendPaid = async (body) => {
    const paid = await confirmed();
    return paid === null
      ? false
      : write(() => api.telegramChannelDmSend({ ...body, stars: paid }));
  };

  const sendPlain = (text) =>
    admin || stars > 0
      ? sendPaid(replyBody({ chat, peer, text, stars }))
      : write(() =>
          api.sendMessage({
            source: 'telegram',
            chat,
            text: text.trim(),
            clientId: newClientId(),
          })
        );

  const suggest = (fields) => {
    const body = suggestBody({ chat, stars, ...fields }, Date.now());
    if (!body) {
      setError('bad-suggestion');
      return false;
    }
    return sendPaid(body);
  };

  const decide = async (comment) => {
    const message = history.messages.find((m) => m.id === decision.id);
    const done = await write(() =>
      api.telegramChannelDmDecide(
        decideBody({ chat, message, approve: decision.approve, comment })
      )
    );
    if (done) {
      setDecision(null);
    }
  };

  const when = (at) => dateTime(at);
  return el(
    'div',
    { className: 'dm-thread', 'data-dm-thread': peer ?? 'own' },
    [
      el(
        'div',
        { key: 'l', className: 'dm-messages' },
        history.phase === 'loading'
          ? el('p', { className: 'meta' }, t('chat.dm.loading'))
          : [
              ...history.messages.map((message) =>
                el(Bubble, {
                  key: message.id,
                  message,
                  admin,
                  t,
                  when,
                  decide: {
                    decision,
                    busy,
                    onPick: setDecision,
                    onSend: decide,
                    onCancel: () => setDecision(null),
                  },
                })
              ),
              history.phase === 'ready' && history.messages.length === 0
                ? el('p', { key: 'e', className: 'meta' }, t('chat.dm.empty'))
                : null,
              el('span', { key: 'end', ref: end }),
            ]
      ),
      history.phase === 'error' || error
        ? el(
            'p',
            { key: 'x', className: 'comments-failed', role: 'alert' },
            errorText(t, error ?? history.code)
          )
        : null,
      el(Composer, {
        key: 'c',
        t,
        admin,
        stars,
        busy,
        onSend: sendPlain,
        onSuggest: suggest,
      }),
    ]
  );
};
