// Telegram's round @ and ♥ buttons above "down" (R-Y55): how many
// mentions of us and reactions to our messages are not seen yet; a click
// goes to the oldest one (the chat opened around it when it is far back,
// R-Y107) and tells
// Telegram it was seen — after the last one, the chat's whole list.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';

const el = React.createElement;
const KINDS = [
  { kind: 'mentions', icon: 'at', label: 'chat.marks.mentions' },
  { kind: 'reactions', icon: 'heart', label: 'chat.marks.reactions' },
];

/** `next(kind)` goes to the next unread mark; `busy` while it does. */
export const useUnreadMarks = (api, current, { scrollTo }) => {
  const queues = useRef({ mentions: [], reactions: [] });
  const [busy, setBusy] = useState(null);
  const chat = current?.source === 'telegram' ? current.chat : null;
  useEffect(() => {
    queues.current = { mentions: [], reactions: [] };
    setBusy(null);
  }, [chat]);

  const fill = async (kind) => {
    if (queues.current[kind].length === 0) {
      const answer = await api.telegramUnreadMarks({ chat, kind });
      queues.current[kind] = [...(answer?.ids ?? [])];
    }
    return queues.current[kind];
  };

  const next = async (kind) => {
    if (!chat || busy || typeof api?.telegramUnreadMarks !== 'function') {
      return;
    }
    setBusy(kind);
    try {
      const queue = await fill(kind);
      const id = queue.shift();
      const last = queue.length === 0;
      if (id === undefined) {
        // Telegram has none left: its count was behind.
        await api.telegramReadMarks?.({ chat, kind, ids: [], last: true });
        return;
      }
      const key = `msg:telegram:${chat}:${id}`;
      await scrollTo(key);
      await api.telegramReadMarks?.({ chat, kind, ids: [id], last });
    } finally {
      setBusy(null);
    }
  };
  return { next, busy };
};

const Mark = ({ kind, icon, label, count, busy, onClick }) => {
  const t = useT();
  return el(
    'button',
    {
      type: 'button',
      className: busy ? 'chat-mark busy' : 'chat-mark',
      'data-action': `next-${kind}`,
      'aria-label': `${t(label)}: ${count}`,
      title: t(label),
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
        onClick: () => marks.next(mark.kind),
      })
    )
  );
};
