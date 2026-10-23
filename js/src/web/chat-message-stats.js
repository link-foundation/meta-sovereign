// A channel post's statistics, as Telegram Desktop shows them to the
// channel's admins (R-Y195; learned, never copied): the menu of a post has
// "Statistics", which opens its views and reactions graphs (the graph
// cards of ./chat-stats.js) and "Public shares" — the public channels that
// shared the post, each with its post's views and a link that opens that
// post in the app — a page at a time with "Show more".

import React, { useCallback, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Frame, useAnswer, useReaders } from './chat-readers.js';
import { GraphCard } from './chat-stats.js';
import { networkMessageId } from './chat-model.js';
import { openMessageLink } from './message-links.js';

const el = React.createElement;

/** Whether the menu offers "Statistics": a sent post of a channel we may view. */
export const hasMessageStats = (message, chat, info) =>
  message?.source === 'telegram' &&
  !message.pending &&
  !message.service &&
  /^-100\d+$/.test(String(chat?.chat ?? message?.chat ?? '')) &&
  Boolean(info?.broadcast && info?.canViewStats) &&
  networkMessageId(message) !== null;

/** The t.me link of a shared post: by username, else by channel id. */
export const postLink = (item) => {
  const id = Number(item?.id);
  if (!(id > 0)) {
    return null;
  }
  if (item.username) {
    return `https://t.me/${item.username}/${id}`;
  }
  const digits = String(item.chat ?? '').replace(/^-100/, '');
  return /^\d+$/.test(digits) ? `https://t.me/c/${digits}/${id}` : null;
};

const errorText = (t, code) => {
  const key = `chat.stats.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.stats.err.failed') : text;
};

const ShareRow = ({ item, close }) => {
  const t = useT();
  const dates = useDates();
  const href = postLink(item);
  return el('li', { className: 'stats-share-row', 'data-forward': item.kind }, [
    el('strong', { key: 'n' }, item.name),
    item.kind === 'story'
      ? el('span', { key: 's', className: 'meta' }, t('chat.mstats.story'))
      : el('span', { key: 'v', className: 'meta' }, [
          t('chat.mstats.views', { count: item.views }),
          item.date ? ` · ${dates.dateTime(item.date * 1000)}` : '',
        ]),
    href
      ? el(
          'a',
          {
            key: 'l',
            href,
            target: '_blank',
            rel: 'noreferrer',
            'data-action': 'forward-open',
            onClick: (e) => {
              if (openMessageLink(href)) {
                e.preventDefault();
                close();
              }
            },
          },
          t('chat.mstats.open')
        )
      : null,
  ]);
};

// The public shares, a page at a time.
const PublicShares = ({ message, api, close }) => {
  const t = useT();
  const [state, load] = useAnswer(
    (offset) =>
      api.telegramPublicForwards({
        chat: String(message.chat),
        id: networkMessageId(message),
        ...(offset ? { offset } : {}),
      }),
    message.id
  );
  let body;
  if (state.phase === 'loading') {
    body = el('p', { className: 'meta' }, t('chat.stats.loading'));
  } else if (state.phase === 'error') {
    body = el(
      'p',
      { className: 'comments-failed', role: 'alert' },
      errorText(t, state.code)
    );
  } else if (state.items.length === 0) {
    body = el('p', { className: 'meta' }, t('chat.mstats.noShares'));
  } else {
    body = el('ul', { className: 'member-list' }, [
      ...state.items.map((item, i) =>
        el(ShareRow, { key: `${item.chat}:${item.id}:${i}`, item, close })
      ),
    ]);
  }
  return el('section', { className: 'stats-list', 'data-stats-shares': true }, [
    el(
      'strong',
      { key: 'h' },
      state.count > 0
        ? t('chat.mstats.shares', { count: state.count })
        : t('chat.mstats.sharesHead')
    ),
    body,
    state.next
      ? el(
          'button',
          {
            key: 'm',
            type: 'button',
            className: 'comments-older',
            'data-action': 'forwards-more',
            onClick: () => load(state.next),
          },
          t('chat.readers.more')
        )
      : null,
  ]);
};

const MessageStatsPanel = ({ message, api, close }) => {
  const t = useT();
  const [state] = useAnswer(async () => {
    const answer = await api.telegramMessageStats({
      chat: String(message.chat),
      id: networkMessageId(message),
    });
    return answer?.ok ? { ...answer, items: answer.graphs } : answer;
  }, message.id);
  return el(
    Frame,
    { title: t('chat.mstats.title'), close, name: 'message-stats' },
    el('div', { className: 'stats-body', 'data-stats-kind': 'post' }, [
      state.phase === 'loading'
        ? el('p', { key: 'l', className: 'meta' }, t('chat.stats.loading'))
        : null,
      state.phase === 'error'
        ? el(
            'p',
            {
              key: 'e',
              className: 'comments-failed',
              role: 'alert',
              'data-stats-error': state.code ?? 'failed',
            },
            errorText(t, state.code)
          )
        : null,
      ...state.items.map((entry) =>
        el(GraphCard, {
          key: entry.key,
          api,
          chat: String(message.chat),
          entry,
        })
      ),
      el(PublicShares, { key: 'shares', message, api, close }),
    ])
  );
};

/** The panel of the open chat: `{ open(message), dialog }`. */
export const useMessageStats = ({ api }) => {
  const [shown, setShown] = useState(null);
  const close = useCallback(() => setShown(null), []);
  return {
    open: (message) => setShown(message),
    dialog: shown
      ? el(MessageStatsPanel, { key: 'mstats', message: shown, api, close })
      : null,
  };
};

/**
 * `useReaders` with the post statistics: the menu's `actions(message)` and
 * one `dialog`.
 */
export const useReadersWithStats = ({ api, info }) => {
  const readers = useReaders({ api, info });
  const stats = useMessageStats({ api });
  return {
    // The menu's actions for `message`: Seen by, Who reacted, Statistics.
    actions: (message) => ({
      readers: () => readers.open('readers', message),
      reactors: () => readers.open('reactors', message),
      messageStats: () => stats.open(message),
    }),
    dialog: el(
      React.Fragment,
      { key: 'readers' },
      readers.dialog,
      stats.dialog
    ),
  };
};
