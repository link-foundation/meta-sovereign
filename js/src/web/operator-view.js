import React, { useEffect, useRef, useState } from 'react';
import { api as defaultApi } from './dom.js';
import { useT } from './i18n.js';
import { useChatState } from './chat-state.js';
import { ChatScreen } from './chat-view.js';
import { ConnectionGuide } from './connection-guide.js';
import { LoadError } from './api-errors.js';
import { useOperatorUnread } from './operator-unread.js';
import { navigateApp, operatorHash, appNavigation } from './app-route.js';
import { useOperatorScope } from './operator-prefs.js';
import { postponeOperatorChat, useOperatorOrder } from './operator-order.js';
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
    followHash: true,
    hashView: 'operator',
    selectFirst: false,
  });
  const [handled, setHandled] = useState(() => new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [scope] = useOperatorScope();
  const [order, setOrder] = useOperatorOrder(state.all, state.loading);
  const queue = operatorQueue(state.all, handled, scope, order);
  const latest = useRef(null);
  const unread = useOperatorUnread(api, state, queue);
  latest.current = { state, queue, order, busy: busy || !unread.current };
  useEffect(() => {
    if (unread.current && appNavigation().snapshot().view === 'operator') {
      navigateApp(
        { view: 'operator', anchor: operatorHash(unread.current.key) },
        { replace: true }
      );
    }
  }, [unread.current?.key]);
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
    if (latest.current.busy || !now.current) {
      return;
    }
    const following = items.find((chat) => chat.key !== now.current.key);
    if (following && following.key !== now.current?.key) {
      latest.current.busy = true;
      setOrder(postponeOperatorChat(latest.current.order, now.current.key));
      navigateApp({ view: 'operator', anchor: operatorHash(following.key) });
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

  return {
    state,
    current: unread.current,
    queue,
    busy,
    error,
    advance,
    done,
    unread,
  };
};

const OperatorCard = ({ state, api, current, unread, queue, t }) => {
  if (current) {
    return el(
      'article',
      { className: 'operator-card', 'data-operator-chat': current.key },
      el(ChatScreen, { state, api, embedded: true })
    );
  }
  if (unread.error || state.loadError) {
    return null;
  }
  if (unread.checking || queue.length) {
    return el(PageLoading, {
      label: t('operator.checking'),
      'data-operator-checking': '',
    });
  }
  return el('div', { className: 'operator-empty', role: 'status' }, [
    el('h3', { key: 'h' }, t('operator.empty')),
    el('p', { key: 'hint', className: 'meta' }, t('operator.emptyHint')),
  ]);
};
const needsConnection = (state) =>
  !state.total &&
  !state.telegram?.connected &&
  state.telegram?.ready &&
  !state.loadError;

export const OperatorView = ({ api = defaultApi }) => {
  const t = useT();
  const { state, current, queue, busy, error, advance, done, unread } =
    useOperator(api, t);
  if (!state.loading && needsConnection(state)) {
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
            state.loading
              ? t('operator.loading')
              : t('operator.remaining', { count: queue.length })
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
                busy ||
                !current ||
                !queue.some((chat) => chat.key !== current?.key),
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
      state.loadError
        ? el(LoadError, {
            key: 'load-error',
            error: state.loadError,
            retry: state.retryLoad,
          })
        : null,
      unread.error
        ? el(LoadError, {
            key: 'unread-error',
            error: unread.error,
            retry: unread.retry,
          })
        : null,
      error
        ? el(
            'p',
            { key: 'error', role: 'alert', className: 'comments-failed' },
            error
          )
        : null,
      state.loading
        ? el(PageLoading, {
            key: 'body',
            label: t('operator.loading'),
            'data-operator-loading': '',
          })
        : el(OperatorCard, {
            key: 'body',
            state,
            api,
            current,
            unread,
            queue,
            t,
          }),
    ]
  );
};
