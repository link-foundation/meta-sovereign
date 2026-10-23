// Inline bots in the message box, as Telegram Desktop's (R-Y138; learned,
// never copied): `@gif cats` (a bot's name, a space, the words) shows the
// bot's hint while nothing follows, then, a moment after typing stops,
// its answers over the box — pictures in a grid, articles in a list.
// Up and Down move, Enter picks, Escape closes; more are asked for at
// the end of the list. A pick is sent through the bot (with the reply the
// box is answering) and the box is emptied. Pictures come only from the
// app's own server (a GIF or sticker the bot named by file); a photo or
// an answer that only names a web address shows a plain tile, so the
// page never loads another site's address.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { openableUrl } from './chat-bots.js';
import { openChat } from './chat-state.js';
import { composerReplyId } from './forum-topics.js';
import { Picture } from './chat-stickers.js';

const el = React.createElement;

const DEBOUNCE_MS = 400;
const NEAR_END = 48;
const NAME = '[A-Za-z][A-Za-z0-9_]{2,31}';

/** `@name words` at the start of the box: `{ username, query }`, else null. */
export const parseInline = (text) => {
  const found = new RegExp(`^@(${NAME}) ([\\s\\S]*)$`).exec(String(text ?? ''));
  return found
    ? {
        username: found[1],
        // eslint-disable-next-line no-control-regex
        query: found[2].replace(/[\u0000-\u001f\u007f]+/g, ' ').trim(),
      }
    : null;
};

/** Can this chat ask inline bots: a Telegram chat of a user account. */
export const canInline = (state, api) =>
  state.current?.source === 'telegram' &&
  state.telegram?.kind === 'user' &&
  typeof api?.telegramInlineBot === 'function' &&
  typeof api?.telegramInlineResults === 'function' &&
  typeof api?.telegramInlineSend === 'function';

// Answers that mean "that was no inline bot": an ordinary @mention.
const QUIET = new Set(['not-inline', 'no-bot', 'bad-request']);

// The codes with words of their own; any other is "failed".
const SHOWN = new Set([
  'bot-inline-disabled',
  'bot-timeout',
  'inline-forbidden',
  'write-forbidden',
  'expired',
  'no-access',
  'flood-wait',
]);
const errorKey = (code) =>
  `chat.inline.err.${SHOWN.has(code) ? code : 'failed'}`;

/** The answers merged: a next page's results after the ones shown. */
export const mergeResults = (shown, more) => ({
  ...more,
  results: [
    ...(shown?.results ?? []),
    ...more.results.filter(
      (r) => !(shown?.results ?? []).some((s) => s.id === r.id)
    ),
  ],
});

/** Grid (pictures) or list (articles). */
export const layoutOf = (found) =>
  found.gallery ||
  (found.results.length > 0 && found.results.every((r) => r.doc))
    ? 'grid'
    : 'list';

// A tile's picture: the bot's file, else a plain tile.
const Tile = ({ api, result }) =>
  result.doc
    ? el(Picture, { api, item: result.doc })
    : el(
        'span',
        { className: 'inline-plain' },
        el(Icon, {
          name: result.type === 'gif' ? 'gif' : 'image',
          size: 22,
        })
      );

const Result = ({ api, result, layout, selected, onPick, onHover }) =>
  el(
    'button',
    {
      type: 'button',
      role: 'option',
      className: `inline-result inline-${layout}`,
      'data-inline-result': result.id,
      title: result.title || undefined,
      'aria-selected': selected ? 'true' : 'false',
      onMouseDown: (event) => event.preventDefault(),
      onMouseEnter: onHover,
      onClick: onPick,
    },
    layout === 'grid'
      ? el(Tile, { api, result })
      : [
          el('span', { key: 'p', className: 'inline-thumb' }, [
            el(Tile, { key: 't', api, result }),
          ]),
          el('span', { key: 'x', className: 'inline-text' }, [
            el('b', { key: 'b' }, result.title || result.type),
            result.description
              ? el('span', { key: 'd', className: 'meta' }, result.description)
              : null,
          ]),
        ]
  );

const Extras = ({ found, onOpenBot, onMore, loading }) => {
  const t = useT();
  const webview = found.switchWebview
    ? openableUrl(found.switchWebview.url)
    : null;
  return [
    found.switchPm
      ? el(
          'button',
          {
            key: 'pm',
            type: 'button',
            className: 'inline-switch',
            'data-action': 'inline-switch-pm',
            onClick: onOpenBot,
          },
          found.switchPm.text
        )
      : null,
    webview
      ? el(
          'a',
          {
            key: 'wv',
            className: 'inline-switch',
            href: webview,
            target: '_blank',
            rel: 'noopener',
          },
          found.switchWebview.text
        )
      : null,
    found.next
      ? el(
          'button',
          {
            key: 'more',
            type: 'button',
            className: 'inline-more',
            'data-action': 'inline-more',
            disabled: loading,
            onClick: onMore,
          },
          t('chat.inline.more')
        )
      : null,
  ];
};

/** The panel over the box. */
export const InlinePanel = ({ api, box }) => {
  const t = useT();
  const { bot, found, error, loading, index } = box;
  const items = found?.results ?? [];
  const layout = found ? layoutOf(found) : 'list';
  let status = null;
  if (error) {
    status = t(errorKey(error));
  } else if (loading && items.length === 0) {
    status = t('chat.inline.loading');
  } else if (found && items.length === 0 && !found.switchPm) {
    status = t('chat.inline.empty');
  }
  return el(
    'div',
    { className: 'inline-panel', 'data-inline-bot': bot.username },
    [
      el('div', { key: 'h', className: 'inline-hint' }, [
        el('b', { key: 'n' }, `@${bot.username}`),
        el('span', { key: 'p' }, ` ${bot.placeholder}`),
      ]),
      status
        ? el(
            'div',
            { key: 's', className: 'inline-status', role: 'status' },
            status
          )
        : null,
      items.length > 0
        ? el(
            'div',
            {
              key: 'r',
              className: `inline-results is-${layout}`,
              role: 'listbox',
              'aria-label': t('chat.inline.label'),
              onScroll: box.onScroll,
            },
            items.map((result, i) =>
              el(Result, {
                key: result.id,
                api,
                result,
                layout,
                selected: i === index,
                onPick: () => box.pick(result),
                onHover: () => box.setIndex(i),
              })
            )
          )
        : null,
      found
        ? el(Extras, {
            key: 'x',
            found,
            loading,
            onOpenBot: box.openBot,
            onMore: box.more,
          })
        : null,
    ]
  );
};

// The bot behind the name: asked once per name, a bot only if inline.
const useInlineBot = (api, active, username) => {
  const known = useRef(new Map());
  const [, update] = useState(0);
  const key = username?.toLowerCase();
  useEffect(() => {
    if (!active || !key || known.current.has(key)) {
      return;
    }
    known.current.set(key, { status: 'loading' });
    Promise.resolve(api.telegramInlineBot({ username })).then(
      (answer) => {
        known.current.set(
          key,
          answer?.ok ? { bot: answer.bot } : failed(answer)
        );
        update((n) => n + 1);
      },
      () => known.current.delete(key)
    );
  }, [active, key]);
  return active && key ? (known.current.get(key) ?? null) : null;
};

const failed = (answer) => ({
  error: QUIET.has(answer?.code) ? null : (answer?.code ?? 'failed'),
});

// The answers for the words, a moment after typing stops; a next page
// merged after the shown ones.
const useInlineAnswers = ({ api, chat, bot, query }) => {
  const [state, setState] = useState({
    found: null,
    error: null,
    loading: false,
  });
  const token = useRef(0);
  const username = bot?.username;
  const fetchPage = async (offset, shown) => {
    const mine = ++token.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    const answer = await Promise.resolve(
      api.telegramInlineResults({ chat, username, query, offset })
    ).catch(() => null);
    if (mine !== token.current) {
      return;
    }
    if (answer?.ok) {
      const merged = shown ? mergeResults(shown, answer) : answer;
      setState({ found: merged, error: null, loading: false });
    } else {
      setState({
        found: shown ?? null,
        error: answer?.code ?? 'failed',
        loading: false,
      });
    }
  };
  useEffect(() => {
    token.current += 1;
    setState({ found: null, error: null, loading: false });
    if (!username || !query) {
      return undefined;
    }
    const timer = globalThis.setTimeout(() => fetchPage(''), DEBOUNCE_MS);
    return () => globalThis.clearTimeout(timer);
  }, [chat, username, query]);
  return {
    ...state,
    more: () =>
      state.found?.next && !state.loading
        ? fetchPage(state.found.next, state.found)
        : undefined,
  };
};

const STEPS = { ArrowDown: 1, ArrowUp: -1 };

// A pick sent through the bot (with the reply the box answers); the box
// emptied, or the reason shown.
const usePick = ({ api, chat, composer }) => {
  const [sendError, setSendError] = useState(null);
  const pick = async (result) => {
    const replyTo = composerReplyId(composer);
    const answer = await api.telegramInlineSend({
      chat,
      queryId: result.queryId,
      id: result.id,
      ...(replyTo ? { replyTo } : {}),
      clientId: `inline-${Date.now()}-${result.id}`,
    });
    if (answer?.ok) {
      composer.setText('');
      composer.clearReplyTo?.();
    } else {
      setSendError(answer?.code ?? 'failed');
    }
  };
  return { pick, sendError, clearError: () => setSendError(null) };
};

// Up and Down move, Enter picks, Escape closes; true when a key was taken.
const keyHandler =
  ({ shown, items, index, setIndex, close, pick }) =>
  (event) => {
    if (!shown || event.shiftKey || event.ctrlKey || event.metaKey) {
      return false;
    }
    const step = STEPS[event.key];
    if (event.key === 'Escape') {
      close();
    } else if (items.length === 0) {
      return false;
    } else if (step) {
      setIndex((index + step + items.length) % items.length);
    } else if (event.key === 'Enter') {
      pick(items[Math.min(index, items.length - 1)]);
    } else {
      return false;
    }
    event.preventDefault();
    return true;
  };

// What the box asks: the bot and words typed, and the chat.
const inlineContext = (state, api, text) => {
  const parsed = canInline(state, api) ? parseInline(text) : null;
  const chat = state.current?.chat ? String(state.current.chat) : null;
  return { parsed: parsed ?? { username: null, query: '' }, chat };
};

const InlineProblem = ({ code }) => {
  const t = useT();
  return el(
    'div',
    { key: 'inline-bot', className: 'inline-panel' },
    el('div', { className: 'inline-status', role: 'status' }, t(errorKey(code)))
  );
};

/**
 * The composer's part: `{ panel, onKey }`. `onKey(event)` is true when it
 * took the key (the panel open and the key one it uses).
 */
export const useInlineBox = ({ api, state, composer, text }) => {
  const { parsed, chat } = inlineContext(state, api, text);
  const entry = useInlineBot(api, Boolean(parsed.username), parsed.username);
  const bot = entry?.bot ?? null;
  const answers = useInlineAnswers({ api, chat, bot, query: parsed.query });
  const [closedAt, setClosedAt] = useState(null);
  const [index, setIndex] = useState(0);
  const items = answers.found?.results ?? [];
  const shown = Boolean(bot) && closedAt !== text;
  const { pick, sendError, clearError } = usePick({
    api,
    chat,
    composer,
  });
  useEffect(() => setIndex(0), [answers.found?.queryId]);
  useEffect(clearError, [text]);
  const onKey = keyHandler({
    shown,
    items,
    index,
    setIndex,
    close: () => setClosedAt(text),
    pick,
  });
  const onScroll = (event) => {
    const list = event.currentTarget;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - NEAR_END) {
      answers.more();
    }
  };
  if (!shown) {
    return {
      onKey,
      panel:
        entry?.error && closedAt !== text
          ? el(InlineProblem, { key: 'inline-bot', code: entry.error })
          : null,
    };
  }
  return {
    onKey,
    panel: el(InlinePanel, {
      key: 'inline-bot',
      api,
      box: {
        bot,
        found: answers.found,
        error: sendError ?? answers.error,
        loading: answers.loading,
        index: Math.min(index, Math.max(items.length - 1, 0)),
        setIndex,
        pick,
        more: answers.more,
        onScroll,
        openBot: () => {
          setClosedAt(text);
          openChat({ source: 'telegram', chat: bot.id });
        },
      },
    }),
  };
};
