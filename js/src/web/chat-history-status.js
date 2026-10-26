import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Spinner } from './spinner.js';

const el = React.createElement;

const phaseOf = (history, now) => {
  const waiting = history?.retryAt > now;
  if (waiting) {
    return {
      busy: false,
      waiting: true,
      phase: 'waiting',
      key:
        history.retryCode === 'flood-wait'
          ? 'chat.history.wait'
          : 'chat.history.retry',
    };
  }
  if (history?.initialLoading || history?.loading) {
    return {
      busy: true,
      waiting: false,
      phase: 'loading',
      key: 'chat.history.loading',
    };
  }
  if (history?.backgroundLoading && history.incomplete) {
    return {
      busy: true,
      waiting: false,
      phase: 'background',
      key: 'chat.history.background',
    };
  }
  return {
    busy: false,
    waiting: false,
    phase: 'partial',
    key: 'chat.history.partial',
  };
};

// Kept outside the scrolling messages, so a partial cache never looks
// like a complete conversation and a Telegram wait is always explained.
export const HistoryStatus = ({ history, count }) => {
  const t = useT();
  const [now, setNow] = useState(Date.now);
  const until = history?.retryAt ?? 0;
  useEffect(() => {
    if (!until) {
      return undefined;
    }
    setNow(Date.now());
    const timer = globalThis.setInterval(() => setNow(Date.now()), 1000);
    return () => globalThis.clearInterval(timer);
  }, [until]);
  const { busy, waiting, phase, key } = phaseOf(history, now);
  if (!busy && !until && !history?.incomplete) {
    return null;
  }
  return el(
    'div',
    {
      className: 'chat-history-status',
      role: 'status',
      'aria-live': 'polite',
      'data-history-status': phase,
    },
    [
      busy || waiting ? el(Spinner, { key: 's' }) : null,
      el(
        'span',
        { key: 'text' },
        t(key, {
          count,
          seconds: Math.max(1, Math.ceil((until - now) / 1000)),
        })
      ),
      !busy && !waiting && history?.older
        ? el(
            'button',
            {
              key: 'more',
              type: 'button',
              className: 'ghost',
              onClick: history.loadOlder,
            },
            t('chat.history.more')
          )
        : null,
    ]
  );
};
