// Search across Telegram from the chat list's box, as Telegram's apps
// have it (R-Y107; Telegram Desktop's search in the chat list, learned,
// never copied): under the chats whose names match, "Global search" —
// people and chats Telegram finds by name or username that are not in
// the list (a click opens one) — then "Messages": what Telegram finds in
// every chat, newest first, each with its chat's photo and name, the
// sender, the words found marked, and the date; more come as the list is
// scrolled to its end; a click opens the chat at that message.

import React, { useEffect, useRef, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { ChatAvatar } from './chat-list.js';
import { Spinner } from './spinner.js';

const el = React.createElement;

const WAIT_MS = 400;

const EMPTY = Object.freeze({
  query: '',
  peers: [],
  messages: [],
  count: 0,
  more: false,
  cursor: null,
  loading: false,
});

const usable = (api) =>
  typeof api?.telegramSearchGlobal === 'function' &&
  typeof api?.telegramSearchPeers === 'function';

// The found messages after `before`, each once.
const joined = (before, got) => {
  const seen = new Set(before.map((m) => m.id));
  return [...before, ...got.filter((m) => !seen.has(m.id))];
};

/**
 * What Telegram finds for `query` (once typing stops a moment): `{ peers,
 * messages, count, more, loading, loadMore }`; nothing while `enabled` is
 * false.
 */
export const useGlobalSearch = (api, query, enabled) => {
  const [found, setFound] = useState(EMPTY);
  const ticket = useRef(0);
  const latest = useRef(found);
  latest.current = found;
  const q = String(query ?? '').trim();
  const on = enabled && usable(api) && q.length > 0;

  useEffect(() => {
    const mine = ++ticket.current;
    if (!on) {
      setFound(EMPTY);
      return undefined;
    }
    setFound({ ...EMPTY, query: q, loading: true });
    const timer = globalThis.setTimeout(async () => {
      const [peers, messages] = await Promise.all([
        api.telegramSearchPeers({ q }).catch(() => null),
        api.telegramSearchGlobal({ q }).catch(() => null),
      ]);
      if (mine !== ticket.current) {
        return;
      }
      setFound({
        query: q,
        peers: peers?.peers ?? [],
        messages: messages?.messages ?? [],
        count: Number(messages?.count) || 0,
        more: Boolean(messages?.more && messages.cursor),
        cursor: messages?.cursor ?? null,
        loading: false,
      });
    }, WAIT_MS);
    return () => globalThis.clearTimeout(timer);
  }, [on, q]);

  const loadMore = async () => {
    const now = latest.current;
    if (now.loading || !now.more || !now.cursor) {
      return;
    }
    const mine = ticket.current;
    setFound((f) => ({ ...f, loading: true }));
    const page = await api
      .telegramSearchGlobal({ q: now.query, cursor: now.cursor })
      .catch(() => null);
    if (mine !== ticket.current) {
      return;
    }
    setFound((f) => ({
      ...f,
      messages: joined(f.messages, page?.messages ?? []),
      more: Boolean(page?.more && page.cursor),
      cursor: page?.cursor ?? null,
      loading: false,
    }));
  };

  return { ...found, on, loadMore };
};

/** `text` with each place `query` is in it marked, as Telegram marks it. */
export const marked = (text, query) => {
  const body = String(text ?? '');
  const q = String(query ?? '').trim();
  if (!q) {
    return [body];
  }
  const lower = body.toLocaleLowerCase();
  const needle = q.toLocaleLowerCase();
  const parts = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at >= 0;) {
    if (at > from) {
      parts.push(body.slice(from, at));
    }
    parts.push(el('mark', { key: at }, body.slice(at, at + q.length)));
    from = at + q.length;
    at = lower.indexOf(needle, from);
  }
  if (from < body.length) {
    parts.push(body.slice(from));
  }
  return parts;
};

// A found message's line starts near the first word found, as Telegram's.
const SNIPPET_LEAD = 24;
const snippetOf = (body, query) => {
  const text = String(body ?? '').replace(/\s+/g, ' ');
  const at = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  return at > SNIPPET_LEAD ? `…${text.slice(at - SNIPPET_LEAD)}` : text;
};

const peerLine = (t, peer) => {
  if (peer.username) {
    return `@${peer.username}`;
  }
  if (peer.members) {
    return t(
      peer.kind === 'channel' ? 'chat.info.subscribers' : 'chat.info.members',
      { count: peer.members }
    );
  }
  return t(`chat.global.kind.${peer.kind}`);
};

const PeerRow = ({ api, peer, onOpen }) => {
  const t = useT();
  return el(
    'button',
    {
      type: 'button',
      className: 'chat-item global-peer',
      'data-peer': peer.chat,
      onClick: () => onOpen(peer),
    },
    [
      el(ChatAvatar, {
        key: 'a',
        api,
        chat: { source: 'telegram', chat: peer.chat, name: peer.name },
      }),
      el('span', { key: 'b', className: 'chat-item-body' }, [
        el(
          'span',
          { key: 'top', className: 'chat-item-top' },
          el('span', { className: 'chat-item-name' }, [
            el('span', { key: 'x', className: 'chat-item-title' }, peer.name),
          ])
        ),
        el(
          'span',
          { key: 'bottom', className: 'chat-item-bottom' },
          el('span', { className: 'chat-item-preview' }, peerLine(t, peer))
        ),
      ]),
    ]
  );
};

// Who wrote it, where Telegram says: "You", or the member in a group.
const whoOf = (t, link) => {
  if (link.sender === 'me') {
    return t('chat.you');
  }
  return link.chatType === 'group' ? (link.senderName ?? null) : null;
};

const MessageRow = ({ api, link, query, onOpen }) => {
  const t = useT();
  const { chatTime } = useDates();
  const who = whoOf(t, link);
  return el(
    'button',
    {
      type: 'button',
      className: 'chat-item global-message',
      'data-found': link.id,
      onClick: () => onOpen(link),
    },
    [
      el(ChatAvatar, {
        key: 'a',
        api,
        chat: { source: 'telegram', chat: link.chat, name: link.chatName },
      }),
      el('span', { key: 'b', className: 'chat-item-body' }, [
        el('span', { key: 'top', className: 'chat-item-top' }, [
          el(
            'span',
            { key: 'n', className: 'chat-item-name' },
            el('span', { className: 'chat-item-title' }, link.chatName ?? '')
          ),
          el(
            'span',
            { key: 't', className: 'chat-item-time' },
            chatTime(link.timestamp)
          ),
        ]),
        el(
          'span',
          { key: 'bottom', className: 'chat-item-bottom' },
          el('span', { className: 'chat-item-preview' }, [
            who
              ? el(
                  'span',
                  { key: 'w', className: 'chat-item-sender' },
                  `${who}: `
                )
              : null,
            ...marked(snippetOf(link.body, query), query),
          ])
        ),
      ]),
    ]
  );
};

// The list's end: seen, the next page of messages is asked for.
const MoreRow = ({ search }) => {
  const row = useRef(null);
  const ask = useRef(search.loadMore);
  ask.current = search.loadMore;
  useEffect(() => {
    const node = row.current;
    const Watch = globalThis.IntersectionObserver;
    if (!node || !search.more || typeof Watch !== 'function') {
      return undefined;
    }
    const watch = new Watch(
      (entries) => entries.some((e) => e.isIntersecting) && ask.current(),
      { rootMargin: '200px 0px' }
    );
    watch.observe(node);
    return () => watch.disconnect();
  }, [search.more, search.messages.length]);
  return search.loading || search.more
    ? el(
        'p',
        { ref: row, className: 'meta chat-list-more', 'data-global-more': '' },
        el(Spinner)
      )
    : null;
};

const Section = ({ title, aside, children }) =>
  el('section', { className: 'chat-group global-group' }, [
    el('h3', { key: 'h' }, [
      el('span', { key: 't' }, title),
      aside ? el('span', { key: 'a', className: 'global-count' }, aside) : null,
    ]),
    ...children,
  ]);

/**
 * The sections under the matching chats: `listed` the keys the list
 * shows (those are not repeated); `onOpenPeer(peer)` and
 * `onOpenMessage(link)` open what was clicked.
 */
export const GlobalResults = ({
  api,
  search,
  listed,
  onOpenPeer,
  onOpenMessage,
}) => {
  const t = useT();
  if (!search.on) {
    return null;
  }
  const peers = search.peers.filter((p) => !listed.has(`telegram:${p.chat}`));
  return el('div', { className: 'global-results', 'data-global': '' }, [
    peers.length > 0
      ? el(
          Section,
          { key: 'p', title: t('chat.global.peers') },
          peers.map((peer) =>
            el(PeerRow, { key: peer.chat, api, peer, onOpen: onOpenPeer })
          )
        )
      : null,
    search.messages.length > 0
      ? el(
          Section,
          {
            key: 'm',
            title: t('chat.global.messages'),
            aside: t('chat.global.found', { count: search.count }),
          },
          search.messages.map((link) =>
            el(MessageRow, {
              key: link.id,
              api,
              link,
              query: search.query,
              onOpen: onOpenMessage,
            })
          )
        )
      : null,
    el(MoreRow, { key: 'more', search }),
  ]);
};
