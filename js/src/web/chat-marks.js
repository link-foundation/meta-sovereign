// Telegram's round @ and ♥ buttons above "down" (R-Y55): how many
// mentions of us and reactions to our messages are not seen yet; a click
// goes to the oldest one (the chat opened around it when it is far back,
// R-Y107) and tells
// Telegram it was seen — after the last one, the chat's whole list.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { networkMessageId } from './chat-model.js';
import { createUnreadNavigator } from './chat-mark-navigation.js';
import { traceClient } from './client-log.js';
import { activeAccount } from './telegram-account-scope.js';

const el = React.createElement;
const KINDS = [
  { kind: 'mentions', icon: 'at', label: 'chat.marks.mentions' },
  { kind: 'reactions', icon: 'heart', label: 'chat.marks.reactions' },
];

/** `next(kind)` goes to the next unread mark; `busy` while it does. */
export const useUnreadMarks = (api, current, { scrollTo, messages = [] }) => {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const latest = useRef(null);
  latest.current = { scrollTo, messages, current };
  const chat = current?.source === 'telegram' ? current.chat : null;
  const account = activeAccount();
  const owner = useRef(null);
  useEffect(() => {
    const navigation = createUnreadNavigator({
      api,
      chat,
      scrollTo: async (id) => {
        const shown = await latest.current.scrollTo(id);
        traceClient(api, 'unread_jump', {
          source: 'telegram',
          chat: String(chat),
          to: id,
          success: Boolean(shown),
        });
        return shown;
      },
      count: (kind) => Number(latest.current.current?.[kind] ?? 0),
      localIds: (kind) =>
        kind === 'mentions'
          ? latest.current.messages
              .filter(
                (message) =>
                  message.sender !== 'me' &&
                  message.raw?.mentioned &&
                  message.raw?.mediaUnread
              )
              .map(networkMessageId)
          : [],
      onBusy: setBusy,
      onError: setError,
    });
    owner.current = { api, chat, account, navigation };
    setBusy(null);
    setError(null);
    return () => {
      navigation.stop();
      if (owner.current?.navigation === navigation) {
        owner.current = null;
      }
    };
  }, [api, chat, account]);
  const next = (kind) =>
    owner.current?.api === api &&
    owner.current?.chat === chat &&
    owner.current?.account === account
      ? owner.current.navigation.next(kind)
      : Promise.resolve(false);
  return { next, busy, error };
};

const Mark = ({ kind, icon, label, count, busy, error, onClick }) => {
  const t = useT();
  return el(
    'button',
    {
      type: 'button',
      className: busy ? 'chat-mark busy' : 'chat-mark',
      'data-action': `next-${kind}`,
      'aria-label': `${t(label)}: ${count}`,
      title: error ? `${t(label)} · ${t('chat.marks.retry')}` : t(label),
      disabled: busy,
      'aria-busy': busy,
      onClick,
    },
    [
      el(Icon, { key: 'i', name: icon, size: 20 }),
      el(
        'span',
        { key: 'n', className: 'chat-down-count' },
        count > 99 ? '99+' : String(count)
      ),
    ]
  );
};

/** The buttons, stacked above "down" (raised when it shows too). */
export const UnreadMarks = ({ current, marks, raised }) => {
  const shown = KINDS.filter(({ kind }) => Number(current?.[kind] ?? 0) > 0);
  if (shown.length === 0) {
    return null;
  }
  return el(
    'div',
    { className: raised ? 'chat-marks raised' : 'chat-marks' },
    shown.map((mark) =>
      el(Mark, {
        key: mark.kind,
        ...mark,
        count: Number(current[mark.kind]),
        busy: marks.busy === mark.kind,
        error: marks.error,
        onClick: () => marks.next(mark.kind),
      })
    )
  );
};
