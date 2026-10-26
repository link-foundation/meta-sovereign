import React, { useEffect, useRef, useState } from 'react';
import { api as defaultApi } from './dom.js';
import { useT } from './i18n.js';
import { useChatState } from './chat-state.js';
import { ChatScreen } from './chat-view.js';
import { ConnectionGuide } from './connection-guide.js';
import { LoadError } from './api-errors.js';
import { PageLoading } from './spinner.js';
import { Icon } from './icons.js';
import {
  completeOperatorChat,
  needsAttention,
  operatorQueue,
  operatorRevision,
} from './operator-model.js';

const el = React.createElement;

const useOperator = (api, t) => {
  const state = useChatState(api, {
    t,
    autoRead: false,
    followHash: false,
    selectFirst: false,
  });
  const [handled, setHandled] = useState(() => new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const queue = operatorQueue(state.all, handled);
  const current = state.current;
  const latest = useRef(null);
  latest.current = { state, queue, busy };

  useEffect(() => {
    if (!current && queue.length) {
      state.select(queue[0].key);
    }
  }, [current?.key, queue[0]?.key]);
  // Once the read acknowledgement arrives, a later manual unread mark
  // on the same message may enqueue this conversation again.
  useEffect(() => {
    setHandled((before) => {
      const kept = new Map(
        [...before].filter(([key]) =>
          state.all.some((chat) => chat.key === key && needsAttention(chat))
        )
      );
      return kept.size === before.size ? before : kept;
    });
  }, [state.all]);

  const advance = () => {
    const { state: now, queue: items } = latest.current;
    const index = items.findIndex((chat) => chat.key === now.current?.key);
    const following = items[(index + 1) % items.length];
    if (following && following.key !== now.current?.key) {
      now.select(following.key);
      setError(null);
    }
  };
  const done = async () => {
    const { state: now } = latest.current;
    if (latest.current.busy || !now.current) {
      return;
    }
    latest.current.busy = true;
    setBusy(true);
    setError(null);
    const snapshot = now.current;
    try {
      await completeOperatorChat(api, snapshot, now.messages);
      setHandled((before) =>
        new Map(before).set(snapshot.key, operatorRevision(snapshot))
      );
      const following = latest.current.queue.find(
        (chat) => chat.key !== snapshot.key
      );
      now.select(following?.key ?? '');
      now.refresh();
    } catch {
      setError(t('operator.failed'));
    } finally {
      setBusy(false);
    }
  };
  const actions = useRef(null);
  actions.current = { advance, done };
  useEffect(() => {
    const key = (event) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        latest.current.busy ||
        event.target?.closest?.(
          'input, textarea, select, [contenteditable], [role="dialog"]'
        )
      ) {
        return;
      }
      const action = { n: 'advance', d: 'done' }[
        String(event.key).toLowerCase()
      ];
      if (action) {
        event.preventDefault();
        actions.current[action]();
      }
    };
    globalThis.addEventListener?.('keydown', key);
    return () => globalThis.removeEventListener?.('keydown', key);
  }, []);

  return { state, current, queue, busy, error, advance, done };
};

export const OperatorView = ({ api = defaultApi }) => {
  const t = useT();
  const { state, current, queue, busy, error, advance, done } = useOperator(
    api,
    t
  );
  if (state.loading) {
    return state.loadError
      ? el(LoadError, { error: state.loadError, retry: state.retryLoad })
      : el(PageLoading);
  }
  if (!state.total && !state.telegram?.connected) {
    return el(ConnectionGuide, { section: 'operator' });
  }
  return el(
    'section',
    { className: 'operator-workspace', 'aria-label': t('operator.title') },
    [
      el('header', { key: 'header', className: 'operator-toolbar' }, [
        el('div', { key: 'status' }, [
          el('h2', { key: 'h' }, t('operator.title')),
          el(
            'p',
            {
              key: 'count',
              className: 'meta',
              role: 'status',
              'aria-live': 'polite',
            },
            t('operator.remaining', { count: queue.length })
          ),
        ]),
        el('div', { key: 'actions', className: 'row' }, [
          el(
            'button',
            {
              key: 'next',
              type: 'button',
              'data-action': 'operator-next',
              onClick: advance,
              disabled:
                busy || !queue.some((chat) => chat.key !== current?.key),
            },
            [el(Icon, { key: 'i', name: 'chevron-right' }), t('operator.next')]
          ),
          el(
            'button',
            {
              key: 'done',
              type: 'button',
              'data-action': 'operator-done',
              onClick: done,
              disabled: busy || !current,
              'aria-busy': busy,
            },
            [el(Icon, { key: 'i', name: 'check' }), t('operator.done')]
          ),
        ]),
      ]),
      error
        ? el(
            'p',
            { key: 'error', role: 'alert', className: 'comments-failed' },
            error
          )
        : null,
      current
        ? el(
            'article',
            {
              key: 'card',
              className: 'operator-card',
              'data-operator-chat': current.key,
            },
            el(ChatScreen, { state, api, embedded: true })
          )
        : el(
            'div',
            { key: 'empty', className: 'operator-empty', role: 'status' },
            [
              el('h3', { key: 'h' }, t('operator.empty')),
              el(
                'p',
                { key: 'hint', className: 'meta' },
                t('operator.emptyHint')
              ),
            ]
          ),
    ]
  );
};
