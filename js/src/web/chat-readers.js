// "Seen by" and "who reacted" (R-Y127), as Telegram Desktop shows them
// (learned, never copied): a small group's menu of one's own message
// lists who read it and when; a message with reactions lists who reacted
// with what, with a tab for each emoji and a button for more. Both open
// in a small panel; Telegram's refusals (the message too old, the group
// too big) are told in words there.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Icon } from './icons.js';
import { networkMessageId } from './chat-model.js';
import { useEsc } from './chat-invite.js';

const el = React.createElement;

/** The emoji reactions a message carries: `[{ emoji, count }]`. */
export const reactionsOf = (message) =>
  (message?.raw?.reactions?.results ?? [])
    .map((r) => ({
      emoji: r.reaction?.emoticon ?? '✨',
      count: Number(r.count) || 0,
    }))
    .filter((r) => r.count > 0);

/** Whether the menu offers "who reacted": a sent message with reactions. */
export const hasReactors = (message) =>
  message?.source === 'telegram' &&
  !message.pending &&
  networkMessageId(message) !== null &&
  reactionsOf(message).length > 0;

/** Whether the menu offers "Seen by": one's own message in a group. */
export const hasReaders = (message, chat = {}) =>
  message?.source === 'telegram' &&
  message.sender === 'me' &&
  !message.pending &&
  !message.service &&
  chat.kind === 'group' &&
  networkMessageId(message) !== null;

/**
 * Whether an admin may report this reaction (R-Y195): in a group or
 * supergroup (not a channel) where the user may ban people, someone
 * else's, from a user.
 */
export const canReportReaction = (info, item) =>
  Boolean(info?.canBan) &&
  (info.kind === 'group' || (info.kind === 'channel' && !info.broadcast)) &&
  !item?.my &&
  /^\d{1,20}$/.test(String(item?.peer ?? ''));

const errorText = (t, code) => {
  const key = `chat.readers.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.readers.err.failed') : text;
};

// One answer, asked on mount (and again with `more`), kept as pages.
export const useAnswer = (ask, key) => {
  const [state, setState] = useState({ phase: 'loading', items: [] });
  const asking = useRef(ask);
  asking.current = ask;
  const load = useCallback(
    async (page = null) => {
      const answer = await asking.current(page).catch(() => null);
      setState((prev) =>
        answer?.ok
          ? {
              phase: 'ready',
              count: answer.count ?? null,
              items: [...(page ? prev.items : []), ...answer.items],
              next: answer.next ?? null,
            }
          : { phase: 'error', code: answer?.code, items: [] }
      );
    },
    [key]
  );
  useEffect(() => {
    setState({ phase: 'loading', items: [] });
    load();
  }, [load]);
  return [state, load];
};

const Initial = ({ name }) =>
  el(
    'span',
    { className: 'member-initial', 'aria-hidden': 'true' },
    Array.from(String(name))[0]?.toUpperCase() ?? '?'
  );

const WhenText = ({ ms }) => {
  const t = useT();
  const dates = useDates();
  const day = new Date(ms);
  const today = new Date();
  return t(
    day.toDateString() === today.toDateString()
      ? 'chat.readers.today'
      : 'chat.readers.on',
    { time: dates.time(ms), date: dates.dateTime(ms) }
  );
};

const Row = ({ name, ms, emoji = null, kind, extra = null }) =>
  el('li', { className: 'reader-row', 'data-reader': kind }, [
    el(Initial, { key: 'a', name }),
    el('span', { key: 'n', className: 'member-name' }, name),
    emoji ? el('span', { key: 'e', className: 'reader-emoji' }, emoji) : null,
    ms
      ? el('span', { key: 'w', className: 'meta reader-when' }, [
          el(WhenText, { ms }),
        ])
      : null,
    extra,
  ]);

const Body = ({ state, t, rowOf, more }) => {
  if (state.phase === 'loading') {
    return el('p', { className: 'meta' }, t('chat.readers.loading'));
  }
  if (state.phase === 'error') {
    return el(
      'p',
      { className: 'comments-failed', role: 'alert' },
      errorText(t, state.code)
    );
  }
  if (state.items.length === 0) {
    return el('p', { className: 'meta' }, t('chat.readers.nobody'));
  }
  return el('div', null, [
    el('ul', { key: 'l', className: 'member-list' }, state.items.map(rowOf)),
    state.next
      ? el(
          'button',
          {
            key: 'm',
            type: 'button',
            className: 'comments-older',
            'data-action': 'reactors-more',
            onClick: () => more(state.next),
          },
          t('chat.readers.more')
        )
      : null,
  ]);
};

const Tabs = ({ message, emoji, setEmoji, total }) => {
  const t = useT();
  const all = [{ emoji: '', label: t('chat.readers.all'), count: total }];
  const each = reactionsOf(message).map((r) => ({
    ...r,
    label: r.emoji,
  }));
  return el(
    'div',
    { className: 'reader-tabs', role: 'tablist' },
    [...all, ...each].map((tab) =>
      el(
        'button',
        {
          key: tab.emoji || 'all',
          type: 'button',
          role: 'tab',
          'aria-selected': emoji === tab.emoji,
          'data-tab': tab.emoji || 'all',
          className: emoji === tab.emoji ? 'reader-tab active' : 'reader-tab',
          onClick: () => setEmoji(tab.emoji),
        },
        `${tab.label} ${tab.count}`
      )
    )
  );
};

/** The panel's frame: a title, Close, Escape and a click outside. */
export const Frame = ({ title, close, name = 'readers', children }) => {
  const t = useT();
  useEsc(close);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay comments-overlay',
      onMouseDown: (e) => {
        if (e.target === e.currentTarget) {
          close();
        }
      },
    },
    el(
      'div',
      {
        className: 'reader-panel',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        'data-dialog': name,
      },
      [
        el('header', { key: 'h', className: 'comments-head' }, [
          el('strong', { key: 't', className: 'comments-head-text' }, title),
          el(
            'button',
            {
              key: 'x',
              type: 'button',
              className: 'icon-btn',
              'data-action': 'close',
              'aria-label': t('chat.readers.close'),
              onClick: close,
            },
            el(Icon, { name: 'close' })
          ),
        ]),
        el('div', { key: 'b', className: 'reader-body' }, children),
      ]
    )
  );
};

const ReadersPanel = ({ message, api, close }) => {
  const t = useT();
  const [state] = useAnswer(async () => {
    const answer = await api.telegramReaders({
      chat: String(message.chat),
      id: networkMessageId(message),
    });
    return answer?.ok
      ? {
          ...answer,
          items: answer.readers ?? [],
          count: answer.readers?.length,
        }
      : answer;
  }, message.id);
  return el(
    Frame,
    {
      title:
        state.phase === 'ready'
          ? t('chat.readers.title', { count: state.items.length })
          : t('chat.readers.heading'),
      close,
    },
    el(Body, {
      state,
      t,
      rowOf: (one) =>
        el(Row, { key: one.id, name: one.name, ms: one.date, kind: 'seen' }),
    })
  );
};

// "Report this reaction?": a confirmation, then messages.reportReaction.
const ReportConfirm = ({ item, message, api, done }) => {
  const t = useT();
  const [state, setState] = useState({ busy: false, code: null });
  const report = async () => {
    setState({ busy: true, code: null });
    const answer = await api
      .telegramReportReaction({
        chat: String(message.chat),
        id: networkMessageId(message),
        peer: item.peer,
      })
      .catch(() => null);
    if (answer?.ok) {
      done(true);
    } else {
      setState({ busy: false, code: answer?.code ?? 'failed' });
    }
  };
  return el(
    'div',
    { className: 'reader-report', 'data-report-confirm': true },
    [
      el('p', { key: 'q' }, t('chat.reactors.reportAsk', { name: item.name })),
      state.code
        ? el(
            'p',
            { key: 'e', className: 'comments-failed', role: 'alert' },
            errorText(t, state.code)
          )
        : null,
      el('div', { key: 'b', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'ok',
            type: 'button',
            className: 'danger',
            disabled: state.busy,
            'data-action': 'reaction-report-confirm',
            onClick: report,
          },
          t('chat.reactors.reportConfirm')
        ),
        el(
          'button',
          { key: 'x', type: 'button', onClick: () => done(false) },
          t('common.cancel')
        ),
      ]),
    ]
  );
};

const ReactorsPanel = ({ message, api, close, info }) => {
  const t = useT();
  const [asking, setAsking] = useState(null); // the reaction to report
  const [reported, setReported] = useState(false);
  const [emoji, setEmoji] = useState('');
  const total = reactionsOf(message).reduce((sum, r) => sum + r.count, 0);
  const [state, load] = useAnswer(
    (offset) =>
      api.telegramReactors({
        chat: String(message.chat),
        id: networkMessageId(message),
        ...(emoji ? { emoji } : {}),
        ...(offset ? { offset } : {}),
      }),
    `${message.id}:${emoji}`
  );
  return el(
    Frame,
    { title: t('chat.reactors.title', { count: total }), close },
    [
      el(Tabs, { key: 'tabs', message, emoji, setEmoji, total }),
      reported
        ? el(
            'p',
            { key: 'rep', className: 'meta', role: 'status' },
            t('chat.reactors.reported')
          )
        : null,
      asking
        ? el(ReportConfirm, {
            key: 'ask',
            item: asking,
            message,
            api,
            done: (ok) => {
              setAsking(null);
              setReported(ok);
            },
          })
        : null,
      el(Body, {
        key: 'body',
        state,
        t,
        more: load,
        rowOf: (one, i) =>
          el(Row, {
            key: `${one.peer}:${one.emoji ?? one.customEmojiId}:${i}`,
            name: one.my ? t('chat.readers.you', { name: one.name }) : one.name,
            ms: one.date,
            emoji: one.emoji ?? '✨',
            kind: 'reacted',
            extra: canReportReaction(info, one)
              ? el(
                  'button',
                  {
                    key: 'r',
                    type: 'button',
                    className: 'button reader-report-btn',
                    'data-action': 'reaction-report',
                    onClick: () => {
                      setReported(false);
                      setAsking(one);
                    },
                  },
                  t('chat.reactors.report')
                )
              : null,
          }),
      }),
    ]
  );
};

/**
 * The panel of the open chat: `{ open(kind, message), dialog }`, `kind`
 * `readers` or `reactors`; `dialog` is null while it is closed.
 */
export const useReaders = ({ api, info = null }) => {
  const [shown, setShown] = useState(null);
  const close = useCallback(() => setShown(null), []);
  const Panel = shown?.kind === 'reactors' ? ReactorsPanel : ReadersPanel;
  return {
    open: (kind, message) => setShown({ kind, message }),
    dialog: shown
      ? el(Panel, { key: 'readers', message: shown.message, api, close, info })
      : null,
  };
};
