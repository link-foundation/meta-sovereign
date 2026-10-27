// The recent calls list, as Telegram Desktop's main menu → Calls (R-Y163;
// learned, never copied): a panel with the tabs All and Missed. A row has
// the person's avatar and name, an arrow (down-left for an incoming call,
// up-right for an outgoing one, red when missed), "Video" for a video
// call, the time (today's time, else the date) and how long it lasted;
// consecutive calls with the same person on the same day are one row,
// "Name (3)". A click opens the chat; scrolling to the end reads older
// ones. The app places no calls: this is the history only.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocaleContext, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { PeerAvatar } from './peer-avatar.js';
import { formatCallDuration, groupCalls } from './call-model.js';
import { Icon } from './icons.js';
import { PageLoading } from './spinner.js';

const el = React.createElement;

/** The time of a call: today's time, else the date. */
export const callWhen = (ms, locale, now = Date.now()) => {
  const date = new Date(ms);
  const sameDay = date.toDateString() === new Date(now).toDateString();
  return sameDay
    ? date.toLocaleTimeString(locale, { timeStyle: 'short' })
    : date.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
};

const nearEnd = (node) =>
  node.scrollHeight - node.scrollTop - node.clientHeight < 80;

// The calls of a tab, a page at a time; a stale answer (another tab was
// chosen meanwhile) is dropped.
const useCalls = (api, missed) => {
  const [state, setState] = useState({ phase: 'loading', calls: [] });
  const asked = useRef(0);
  const busy = useRef(false);
  const load = useCallback(
    async (offsetId = 0) => {
      const turn = asked.current;
      busy.current = true;
      const answer = await api
        .telegramCalls({ missed, ...(offsetId ? { offsetId } : {}) })
        .catch(() => null);
      busy.current = false;
      if (turn !== asked.current) {
        return;
      }
      setState((prev) =>
        answer?.ok
          ? {
              phase: 'ready',
              calls: [...(offsetId ? prev.calls : []), ...answer.calls],
              next: answer.next ?? null,
            }
          : { phase: 'error', calls: offsetId ? prev.calls : [], next: null }
      );
    },
    [api, missed]
  );
  useEffect(() => {
    asked.current += 1;
    setState({ phase: 'loading', calls: [] });
    load();
  }, [load]);
  const more = () => {
    if (state.next && !busy.current) {
      load(state.next);
    }
  };
  return [state, more];
};

const Arrow = ({ row }) =>
  el(
    'span',
    {
      className: `call-arrow ${row.out ? 'is-out' : 'is-in'}${
        row.missed ? ' is-missed' : ''
      }`,
      'data-direction': row.out ? 'out' : 'in',
      'aria-hidden': 'true',
    },
    row.out ? '↗' : '↙'
  );

const CallRow = ({ api, row, locale, t, open }) => {
  const length = formatCallDuration(row.duration);
  const name = row.name || row.chat;
  const sub = [
    row.video ? t('chat.calls.video') : null,
    callWhen(row.date, locale),
    length,
  ].filter(Boolean);
  return el(
    'li',
    { className: 'call-row-item' },
    el(
      'button',
      {
        type: 'button',
        className: `call-row${row.missed ? ' is-missed' : ''}`,
        'data-call': row.id,
        'data-chat': row.chat,
        onClick: () => open(row),
      },
      [
        el(PeerAvatar, {
          key: 'a',
          api,
          source: 'telegram',
          peer: row.chat,
          name,
          size: 's',
        }),
        el('span', { key: 't', className: 'call-text' }, [
          el(
            'span',
            { key: 'n', className: 'call-name' },
            row.count > 1 ? `${name} (${row.count})` : name
          ),
          el('span', { key: 's', className: 'call-sub meta' }, [
            el(Arrow, { key: 'r', row }),
            ` ${sub.join(' · ')}`,
          ]),
        ]),
      ]
    )
  );
};

const Tabs = ({ missed, setMissed }) => {
  const t = useT();
  return el(
    'div',
    { className: 'reader-tabs', role: 'tablist' },
    [
      [false, 'all', 'chat.calls.all'],
      [true, 'missed', 'chat.calls.missed'],
    ].map(([value, name, key]) =>
      el(
        'button',
        {
          key: name,
          type: 'button',
          role: 'tab',
          'aria-selected': missed === value,
          'data-tab': name,
          className: missed === value ? 'reader-tab active' : 'reader-tab',
          onClick: () => setMissed(value),
        },
        t(key)
      )
    )
  );
};

const Body = ({ api, state, missed, more, open }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const node = useRef(null);
  // A page shorter than the panel could not be scrolled: read the next.
  useEffect(() => {
    const body = node.current;
    if (body && state.next && body.scrollHeight <= body.clientHeight) {
      more();
    }
  }, [state.calls.length, state.next]);
  if (state.phase === 'loading') {
    return el(PageLoading, {
      label: t('chat.calls.loading'),
      className: 'calls-state',
    });
  }
  const rows = groupCalls(state.calls);
  return el(
    'div',
    {
      ref: node,
      className: `calls-scroll${rows.length === 0 ? ' calls-state' : ''}`,
      onScroll: (e) => nearEnd(e.currentTarget) && more(),
    },
    [
      state.phase === 'error'
        ? el(
            'p',
            { key: 'e', className: 'comments-failed', role: 'alert' },
            t('chat.calls.err')
          )
        : null,
      rows.length === 0 && state.phase === 'ready'
        ? el(
            'p',
            { key: 'n', className: 'meta' },
            t(missed ? 'chat.calls.noneMissed' : 'chat.calls.none')
          )
        : null,
      el(
        'ul',
        { key: 'l', className: 'member-list calls-list' },
        rows.map((row) =>
          el(CallRow, { key: row.id, api, row, locale, t, open })
        )
      ),
      state.next
        ? el(
            'button',
            {
              key: 'm',
              type: 'button',
              className: 'comments-older',
              'data-action': 'calls-more',
              onClick: more,
            },
            t('chat.calls.more')
          )
        : null,
    ]
  );
};

export const CallsContent = ({ api, onOpenChat }) => {
  const [missed, setMissed] = useState(false);
  const [state, more] = useCalls(api, missed);
  const open = (row) => {
    onOpenChat({ chat: row.chat, name: row.name || row.chat, kind: 'user' });
  };
  return el('section', { className: 'calls-content' }, [
    el(Tabs, { key: 't', missed, setMissed }),
    el(Body, { key: 'b', api, state, missed, more, open }),
  ]);
};

const CallsPanel = ({ api, close, onOpenChat }) => {
  const t = useT();
  return createPortal(
    el(
      Frame,
      { title: t('chat.calls.title'), close, name: 'calls' },
      el(CallsContent, {
        api,
        onOpenChat: (peer) => {
          close();
          onOpenChat(peer);
        },
      })
    ),
    document.body
  );
};

/** Optional dialog launcher for embedders; the app uses the main Calls section. */
export const CallsButton = ({ api, state }) => {
  const t = useT();
  const [shown, setShown] = useState(false);
  const user = state.telegram?.connected && state.telegram?.kind === 'user';
  if (!user || typeof api?.telegramCalls !== 'function') {
    return null;
  }
  return el('span', { className: 'calls-open' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'icon-btn',
        'data-action': 'calls',
        'aria-label': t('chat.calls.title'),
        title: t('chat.calls.title'),
        onClick: () => setShown(true),
      },
      el(Icon, { name: 'calls' })
    ),
    shown
      ? el(CallsPanel, {
          key: 'p',
          api,
          close: () => setShown(false),
          // A click on a call opens that person's chat.
          onOpenChat: (peer) => state.openAt({ source: 'telegram', ...peer }),
        })
      : null,
  ]);
};
