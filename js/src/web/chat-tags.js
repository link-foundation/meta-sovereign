// Hashtags and cashtags in messages, as Telegram Desktop treats them
// (R-Y182; learned, never copied): a click on #tag or $TAG opens a search
// for it — in the open chat first, with "All chats" and "Public posts"
// beside it; `#tag@username` searches that channel or group. A found
// message opens in its chat as any search result does. `parseTag` and
// `scopesOf` are pure; the dialog draws them.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { MessageRow, openFoundMessage } from './chat-global.js';
import { Spinner } from './spinner.js';

const el = React.createElement;

const TAG_TEXT =
  /^([#$])([\p{L}\p{N}_]{1,64})(?:@([A-Za-z][A-Za-z0-9_]{3,31}))?$/u;

/**
 * What a hashtag or cashtag's text says: `{ tag, username }` (`tag` with
 * its # or $, `username` of a channel named after @, else null), or null
 * for anything else (a bot command, a plain word).
 */
export const parseTag = (text) => {
  const found = TAG_TEXT.exec(String(text ?? '').trim());
  return found
    ? { tag: `${found[1]}${found[2]}`, username: found[3] ?? null }
    : null;
};

/**
 * The places a tag can be searched, in the order shown: `chat` when a
 * Telegram chat is named (the open one, or `#tag@username`'s), then every
 * chat, then public posts.
 */
export const scopesOf = ({ chat = null } = {}) => [
  ...(chat ? ['chat'] : []),
  'all',
  'public',
];

/** The body of the search request for one page. */
export const requestOf = ({ tag, scope, chat = null, cursor = null }) => ({
  tag,
  scope,
  ...(scope === 'chat' ? { chat } : {}),
  ...(cursor ? { cursor } : {}),
});

const EVENT = 'ms-tag-search';

/**
 * Asks the chat screen to search the hashtag or cashtag `text` is; true
 * when a screen took it.
 */
export const openTagSearch = (text) => {
  const parsed = parseTag(text);
  if (!parsed || !globalThis.dispatchEvent) {
    return false;
  }
  const detail = { ...parsed, handled: false };
  globalThis.dispatchEvent(new CustomEvent(EVENT, { detail }));
  return detail.handled;
};

const onTagSearch = (on) => {
  const handler = (event) => {
    event.detail.handled = true;
    on(event.detail);
  };
  globalThis.addEventListener?.(EVENT, handler);
  return () => globalThis.removeEventListener?.(EVENT, handler);
};

const EMPTY = Object.freeze({
  messages: [],
  count: 0,
  cursor: null,
  loading: false,
  code: null,
});

// The pages of one search; a new tag, scope or chat starts again.
const useTagResults = ({ api, tag, scope, chat }) => {
  const [found, setFound] = useState({ ...EMPTY, loading: true });
  const ticket = useRef(0);
  const latest = useRef(found);
  latest.current = found;
  const ready = scope !== 'chat' || Boolean(chat);

  const ask = async (cursor) => {
    const mine = ++ticket.current;
    const answer = await api
      .telegramSearchTag(requestOf({ tag, scope, chat, cursor }))
      .catch(() => null);
    if (mine !== ticket.current) {
      return;
    }
    const failed = !answer?.ok;
    setFound((f) => ({
      messages: failed
        ? cursor
          ? f.messages
          : []
        : [...(cursor ? f.messages : []), ...(answer.messages ?? [])],
      count: failed ? f.count : Number(answer.count) || 0,
      cursor: !failed && answer.more ? (answer.cursor ?? null) : null,
      loading: false,
      code: failed ? (answer?.code ?? 'failed') : null,
    }));
  };

  useEffect(() => {
    if (!ready) {
      return undefined;
    }
    setFound({ ...EMPTY, loading: true });
    ask(null);
    return () => {
      ticket.current += 1;
    };
  }, [tag, scope, chat, ready]);

  return {
    ...found,
    loading: found.loading || !ready,
    more: () => {
      if (!latest.current.loading && latest.current.cursor) {
        const cursor = latest.current.cursor;
        setFound((f) => ({ ...f, loading: true }));
        ask(cursor);
      }
    },
  };
};

const Tabs = ({ t, scopes, scope, setScope }) =>
  el(
    'div',
    { className: 'reader-tabs', role: 'tablist' },
    scopes.map((name) =>
      el(
        'button',
        {
          key: name,
          type: 'button',
          role: 'tab',
          'aria-selected': scope === name,
          'data-scope': name,
          className: scope === name ? 'reader-tab active' : 'reader-tab',
          onClick: () => setScope(name),
        },
        t(`chat.tags.scope.${name}`)
      )
    )
  );

const Results = ({ t, api, results, tag, onOpen }) => {
  if (results.code) {
    return el(
      'p',
      { className: 'comments-failed', role: 'alert' },
      t(results.code === 'flood' ? 'chat.tags.flood' : 'chat.tags.failed')
    );
  }
  if (results.loading && results.messages.length === 0) {
    return el('p', { className: 'meta' }, el(Spinner));
  }
  if (results.messages.length === 0) {
    return el(
      'p',
      { className: 'meta', 'data-tags': 'none' },
      t('chat.tags.none')
    );
  }
  return el('div', { className: 'tag-results', 'data-tags': 'results' }, [
    ...results.messages.map((link) =>
      el(MessageRow, { key: link.id, api, link, query: tag, onOpen })
    ),
    results.cursor
      ? el(
          'button',
          {
            key: 'more',
            type: 'button',
            className: 'comments-older',
            'data-action': 'tags-more',
            onClick: results.more,
          },
          t('chat.tags.more')
        )
      : null,
  ]);
};

// The dialog for one tag: where to look, and what is found there.
const TagDialog = ({ api, state, request, close }) => {
  const t = useT();
  const [named, setNamed] = useState(request.username ? undefined : null);
  const own =
    state.current?.source === 'telegram' ? String(state.current.chat) : null;
  // `#tag@username` names its chat; else the open Telegram chat is it.
  const chat = request.username ? (named?.chat ?? null) : own;
  const pending = Boolean(request.username) && named === undefined;
  const lost = Boolean(request.username) && named === null;
  const [scope, setScope] = useState(null);
  const scopes = scopesOf({ chat: chat ?? (pending ? 'pending' : null) });
  const shown = scopes.includes(scope) ? scope : scopes[0];
  useEffect(() => {
    if (!request.username) {
      return undefined;
    }
    let live = true;
    api
      .telegramResolveLink?.({ username: request.username })
      ?.then((answer) => live && setNamed(answer?.ok ? answer : null))
      .catch(() => live && setNamed(null));
    return () => {
      live = false;
    };
  }, [request.username]);
  const results = useTagResults({
    api,
    tag: request.tag,
    scope: shown,
    chat,
  });
  return el(
    Frame,
    {
      title: t('chat.tags.title', { tag: request.tag }),
      close,
      name: 'tag-search',
    },
    [
      el(Tabs, {
        key: 'tabs',
        t,
        scopes,
        scope: shown,
        setScope,
      }),
      lost
        ? el(
            'p',
            { key: 'lost', className: 'meta' },
            t('chat.tags.unknownChat', { username: request.username })
          )
        : null,
      el(Results, {
        key: 'results',
        t,
        api,
        results,
        tag: request.tag,
        onOpen: (link) => {
          close();
          openFoundMessage(state, link);
        },
      }),
    ]
  );
};

/** Mounted once in the chat screen: the dialog a clicked tag opens. */
export const TagSearchHost = ({ api, state }) => {
  const [request, setRequest] = useState(null);
  useEffect(() => onTagSearch(setRequest), []);
  const usable = typeof api?.telegramSearchTag === 'function';
  if (!request || !usable || typeof document === 'undefined') {
    return null;
  }
  return createPortal(
    el(TagDialog, {
      key: `${request.tag}@${request.username ?? ''}`,
      api,
      state,
      request,
      close: () => setRequest(null),
    }),
    document.body
  );
};
