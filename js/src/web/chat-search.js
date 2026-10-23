// Search in the open chat, as Telegram's apps have it (R-Y98; Telegram
// Desktop's search in a chat, learned, never copied): the magnifier in
// the chat's header, or Ctrl/Cmd+F, opens a bar; what is typed is
// looked for in the whole chat — Telegram is asked, not only what the
// page holds — newest first, and the chat goes to the newest match;
// Enter (or ↑) goes to an older one, Shift+Enter (or ↓) to a newer one,
// "3 of 17" says where; older pages are loaded on the way, as a jump to a
// mention does. Esc closes it. A chat not on Telegram is searched in what
// the page holds.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { Spinner } from './spinner.js';
import { goToMessage } from './chat-jump.js';

const el = React.createElement;

const WAIT_MS = 350;

const fold = (text) => String(text ?? '').toLocaleLowerCase();

/** The messages the page holds with `query` in them, newest first. */
export const localMatches = (messages = [], query = '') => {
  const q = fold(query).trim();
  if (!q) {
    return [];
  }
  return messages
    .filter((m) => !m.pending && fold(m.body).includes(q))
    .map((m) => m.id)
    .reverse();
};

const linkIdOf = (chat, id) => `msg:telegram:${chat}:${id}`;

const CLOSED = Object.freeze({
  open: false,
  query: '',
  results: [],
  at: -1,
  count: 0,
  more: false,
  loading: false,
});

const telegramOf = (api, current) =>
  current?.source === 'telegram' && typeof api?.telegramSearch === 'function';

/**
 * The bar's state and moves: `{ ...state, show, close, setQuery, older,
 * newer }`. `reach(id)` loads older pages until message `id` is held.
 */
export const useChatSearch = ({ api, current, messages, reach }) => {
  const [find, setFind] = useState(CLOSED);
  const latest = useRef(find);
  latest.current = find;
  const asked = useRef(0);
  const key = current?.key ?? null;
  useEffect(() => setFind(CLOSED), [key]);

  const go = async (results, at) => {
    const id = results[at];
    if (id === undefined) {
      return;
    }
    await goToMessage(id, reach);
  };

  const ask = async (query, offsetId = 0) => {
    if (!telegramOf(api, current)) {
      const results = localMatches(messages, query);
      return { results, count: results.length, more: false };
    }
    const answer = await api.telegramSearch({
      chat: String(current.chat),
      q: query,
      ...(offsetId ? { offsetId } : {}),
    });
    const ids = answer?.ids ?? [];
    return {
      results: ids.map((id) => linkIdOf(current.chat, id)),
      count: Number(answer?.count ?? ids.length) || 0,
      more: Boolean(answer?.more),
      last: ids.at(-1) ?? 0,
    };
  };

  const run = async (query) => {
    const ticket = ++asked.current;
    if (!query.trim()) {
      setFind((f) => ({ ...f, results: [], at: -1, count: 0, loading: false }));
      return;
    }
    setFind((f) => ({ ...f, loading: true }));
    const found = await ask(query).catch(() => null);
    if (ticket !== asked.current) {
      return;
    }
    const results = found?.results ?? [];
    setFind((f) => ({
      ...f,
      results,
      at: results.length > 0 ? 0 : -1,
      count: found?.count ?? 0,
      more: Boolean(found?.more),
      last: found?.last ?? 0,
      loading: false,
    }));
    go(results, 0);
  };

  // What is typed is looked for once typing stops a moment.
  useEffect(() => {
    if (!find.open) {
      return undefined;
    }
    const timer = globalThis.setTimeout(() => run(find.query), WAIT_MS);
    return () => globalThis.clearTimeout(timer);
  }, [find.open, find.query, key]);

  const older = async () => {
    const f = latest.current;
    if (f.loading || f.at < 0) {
      return;
    }
    if (f.at + 1 < f.results.length) {
      setFind({ ...f, at: f.at + 1 });
      go(f.results, f.at + 1);
      return;
    }
    if (!f.more) {
      return;
    }
    setFind({ ...f, loading: true });
    const page = await ask(f.query, f.last).catch(() => null);
    const results = [...f.results, ...(page?.results ?? [])];
    const at = page?.results?.length ? f.at + 1 : f.at;
    setFind((now) => ({
      ...now,
      results,
      at,
      more: Boolean(page?.more),
      last: page?.last ?? now.last,
      loading: false,
    }));
    go(results, at);
  };

  const newer = () => {
    const f = latest.current;
    if (f.at > 0) {
      setFind({ ...f, at: f.at - 1 });
      go(f.results, f.at - 1);
    }
  };

  useFindKey(Boolean(current), () =>
    setFind((f) => (f.open ? f : { ...CLOSED, open: true }))
  );

  return {
    ...find,
    show: () => setFind((f) => (f.open ? f : { ...CLOSED, open: true })),
    close: () => {
      asked.current += 1;
      setFind(CLOSED);
    },
    setQuery: (query) => setFind((f) => ({ ...f, query })),
    older,
    newer,
  };
};

// Ctrl/Cmd+F in a chat opens its search, as in Desktop.
const useFindKey = (enabled, open) => {
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && fold(e.key) === 'f') {
        e.preventDefault();
        latest.current();
      }
    };
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, [enabled]);
};

/** The magnifier in the chat's header. */
export const SearchButton = ({ find }) => {
  const t = useT();
  return el(
    'button',
    {
      type: 'button',
      className: find.open
        ? 'chat-find-open icon-btn active'
        : 'chat-find-open icon-btn',
      'data-action': 'chat-find',
      'aria-label': t('chat.find.open'),
      'aria-pressed': find.open,
      title: t('chat.find.open'),
      onClick: find.open ? find.close : find.show,
    },
    el(Icon, { name: 'search' })
  );
};

const where = (t, find) => {
  if (find.loading) {
    return el(Spinner, {});
  }
  if (!find.query.trim()) {
    return '';
  }
  return find.count > 0
    ? t('chat.find.count', { at: find.at + 1, count: find.count })
    : t('chat.find.none');
};

const Step = ({ action, icon, label, onClick, disabled }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'icon-btn',
      'data-action': action,
      'aria-label': label,
      title: label,
      disabled,
      onClick,
    },
    el(Icon, { name: icon, size: 18 })
  );

/** The bar under the header while the chat is searched. */
export const SearchBar = ({ find }) => {
  const t = useT();
  if (!find.open) {
    return null;
  }
  const canOlder =
    find.at >= 0 && (find.at + 1 < find.results.length || find.more);
  return el('div', { className: 'chat-find', role: 'search' }, [
    el(Icon, { key: 'i', name: 'search', size: 16 }),
    el('input', {
      key: 'q',
      type: 'search',
      className: 'chat-find-input',
      autoFocus: true,
      placeholder: t('chat.find.placeholder'),
      'aria-label': t('chat.find.placeholder'),
      value: find.query,
      onChange: (e) => find.setQuery(e.target.value),
      onKeyDown: (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          find.close();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) {
            find.newer();
          } else {
            find.older();
          }
        }
      },
    }),
    el(
      'span',
      { key: 'n', className: 'chat-find-count', 'aria-live': 'polite' },
      where(t, find)
    ),
    el(Step, {
      key: 'up',
      action: 'find-older',
      icon: 'chevron-up',
      label: t('chat.find.older'),
      disabled: !canOlder,
      onClick: find.older,
    }),
    el(Step, {
      key: 'down',
      action: 'find-newer',
      icon: 'chevron-down',
      label: t('chat.find.newer'),
      disabled: !(find.at > 0),
      onClick: find.newer,
    }),
    el(Step, {
      key: 'x',
      action: 'find-close',
      icon: 'close',
      label: t('chat.find.close'),
      onClick: find.close,
    }),
  ]);
};
