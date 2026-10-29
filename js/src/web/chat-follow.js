// How the message list follows its messages, moved out of chat-view.js:
// staying at the bottom as messages arrive, keeping the reader's place
// when older ones load above, asking for older ones near the top, and
// noting which messages were seen, with the unread line.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Spinner } from './spinner.js';
import { Icon } from './icons.js';

const el = React.createElement;

const NEAR_BOTTOM_PX = 80;

// One message across its life: a queued one and the link it becomes
// share the `clientId`.
const identity = (message) => message?.clientId ?? message?.id ?? null;

/**
 * How many messages follow the one that was last (all when unknown).
 * When that one left (deleted), what follows the last of the messages
 * that were there before (`known`, their identities) is new.
 */
export const addedAfter = (messages, lastBefore, known = null) => {
  if (lastBefore === null || lastBefore === undefined) {
    return messages.length;
  }
  const at = messages.findIndex((m) => identity(m) === lastBefore);
  if (at >= 0) {
    return messages.length - 1 - at;
  }
  const kept = known
    ? messages.findLastIndex((m) => known.has(identity(m)))
    : -1;
  if (kept >= 0) {
    return messages.length - 1 - kept;
  }
  return identity(messages.at(-1)) === lastBefore ? 0 : 1;
};

/** What a change in the open chat does to the view. */
export const followMove = ({
  opened,
  line,
  near,
  added,
  justSent,
  detached = false,
}) => {
  if (line) {
    return 'line';
  }
  // A chat opened far back (R-Y106) is read where it is: no following.
  if (detached && !opened && !justSent) {
    return null;
  }
  if (opened || near || (added > 0 && justSent)) {
    return 'end';
  }
  return added > 0 ? 'count' : null;
};

// Older messages are asked for while the top is closer than this many
// screens, so scrolling up never reaches a stretch that is not loaded.
const AHEAD_SCREENS = 2;

export const useOlder = (box, state) => {
  const history = state.history;
  const check = () => {
    const node = box.current;
    if (
      !node ||
      !history?.older ||
      history.loading ||
      history.failed ||
      history.stalled
    ) {
      return;
    }
    if (node.scrollTop < AHEAD_SCREENS * node.clientHeight) {
      history.loadOlder();
    }
  };
  useEffect(check, [
    state.messages.length,
    history?.older,
    history?.loading,
    history?.stalled,
    state.current?.key,
  ]);
  return check;
};

// Anchor an existing row when older history is prepended. Keeping the
// distance to the bottom also counts new messages appended below, and
// mistakes a trimmed window for a prepend: both yank the reader away.
export const useKeepPlace = (box, state) => {
  const before = useRef(null);
  const remember = () => {
    const node = box.current;
    if (!node) {
      return;
    }
    const row = [...node.querySelectorAll('[data-message]')].find(
      (item) =>
        item.getBoundingClientRect().bottom > node.getBoundingClientRect().top
    );
    before.current = {
      key: state.current?.key,
      view: state.history?.view,
      first: state.messages[0]?.id,
      row: row?.dataset.message,
      top: row?.getBoundingClientRect().top,
      near:
        node.scrollHeight - node.scrollTop - node.clientHeight < NEAR_BOTTOM_PX,
    };
  };
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) {
      return;
    }
    const saved = before.current;
    if (
      saved &&
      saved.key === state.current?.key &&
      saved.view === state.history?.view &&
      saved.first !== state.messages[0]?.id &&
      state.messages.some((m) => m.id === saved.first)
    ) {
      const row = [...node.querySelectorAll('[data-message]')].find(
        (item) => item.dataset.message === saved.row
      );
      if (saved.near) {
        node.scrollTop = node.scrollHeight;
      } else if (row && Number.isFinite(saved.top)) {
        node.scrollTop += row.getBoundingClientRect().top - saved.top;
      }
    }
    remember();
  });
  return remember;
};

// A compact marker inside the message list, never a header bar. Background
// history availability alone is not an active request and shows no loader.
export const OlderRow = ({ history }) => {
  const t = useT();
  const progress = history ?? {};
  const loading = Boolean(progress.initialLoading || progress.loading);
  const waiting = Boolean(progress.retryAt || progress.failed);
  if (!loading && !waiting) {
    return null;
  }
  const label = loading
    ? t(
        progress.initialLoading ? 'chat.history.loading' : 'chat.loadingEarlier'
      )
    : t(
        progress.retryCode === 'flood-wait'
          ? 'chat.history.wait'
          : 'chat.history.retry'
      );
  return el(
    'div',
    {
      className: 'chat-older',
      role: 'status',
      title: label,
      'data-older': loading ? 'loading' : 'waiting',
    },
    [
      loading
        ? el(Spinner, { key: 's' })
        : el(Icon, { key: 's', name: 'clock', size: 16 }),
      el('span', { key: 't', className: 'sr-only' }, label),
    ]
  );
};

// Follows the conversation like a messenger: a chat opens at its first
// unread message (or at the end), then follows to the end when the user
// is already there or just sent something; otherwise new messages wait
// below a "new messages" button instead of yanking the view away from
// what the user is reading.
export const useFollow = (state) => {
  const box = useRef(null);
  const end = useRef(null);
  const line = useRef(null);
  const near = useRef(true);
  const seen = useRef({ key: null, last: null, known: null });
  const waitLine = useRef(false);
  const [unseen, setUnseen] = useState(0);
  const [away, setAway] = useState(false);
  const count = state.messages.length;
  const last = state.messages.at(-1);
  const lastId = identity(last);
  // To the very bottom, past the padding the floating composer covers
  // (`scrollIntoView` on the last bubble would leave it underneath).
  const bottom = () => {
    const node = box.current;
    if (node && typeof node.scrollHeight === 'number') {
      node.scrollTop = node.scrollHeight;
    } else {
      end.current?.scrollIntoView?.({ block: 'end' });
    }
  };
  const toEnd = () => {
    bottom();
    near.current = true;
    setUnseen(0);
  };
  const toLine = () => {
    line.current.scrollIntoView?.({ block: 'start' });
    near.current = false;
    setUnseen(0);
  };
  useLayoutEffect(() => {
    const key = state.current?.key;
    const before = seen.current;
    seen.current = {
      key,
      last: lastId,
      known: new Set(state.messages.map(identity)),
    };
    const opened = before.key !== key;
    // Older pages come in above: only what follows the last one is new.
    const added = opened
      ? count
      : addedAfter(state.messages, before.last, before.known);
    const justSent = last?.sender === 'me' && Boolean(last?.pending);
    // The unread line may come with the chat's first page, just after.
    const lineWanted = opened || waitLine.current;
    // Wait only for this chat's initial page. An already read conversation
    // must not suddenly jump to a newly created unread divider much later.
    waitLine.current = lineWanted && !line.current && count === 0;
    const move = followMove({
      opened,
      line: lineWanted && Boolean(line.current),
      near: near.current,
      added,
      justSent,
      detached: state.history?.detached,
    });
    if (move === 'line') {
      toLine();
    } else if (move === 'end') {
      toEnd();
    } else if (move === 'count') {
      setUnseen((n) => n + added);
    }
  }, [count, lastId, state.current?.key]);
  // A bubble that grows (a failure's actions, a late link preview) keeps
  // the end in view when the user was there.
  useEffect(() => {
    const Observer = globalThis.ResizeObserver;
    const column = end.current?.parentElement;
    if (typeof Observer !== 'function' || !column) {
      return undefined;
    }
    const observer = new Observer(() => {
      if (near.current) {
        bottom();
      }
    });
    observer.observe(column);
    return () => observer.disconnect();
  }, []);
  const onScroll = () => {
    const node = box.current;
    if (!node) {
      return;
    }
    const below = node.scrollHeight - node.scrollTop - node.clientHeight;
    near.current = below < NEAR_BOTTOM_PX;
    // Telegram offers the way down once a screen is above the end.
    setAway(below > node.clientHeight / 2);
    if (near.current) {
      setUnseen(0);
    }
  };
  return { box, end, line, unseen, away, onScroll, toEnd };
};

// Tells `seen(id)` the newest incoming message that is on screen (at
// least half of it), so reading marks the chat read only that far.
export const useSeen = (box, seen, messages) => {
  useEffect(() => {
    const Observer = globalThis.IntersectionObserver;
    const root = box.current;
    if (typeof Observer !== 'function' || !root || !seen) {
      return undefined;
    }
    const observer = new Observer(
      (entries) => {
        const ids = entries
          .filter((e) => e.isIntersecting)
          .map((e) => Number(e.target.dataset.seenId))
          .filter(Number.isFinite);
        if (ids.length > 0) {
          seen(Math.max(...ids));
        }
      },
      { root, threshold: 0.5 }
    );
    for (const node of root.querySelectorAll('[data-seen-id]')) {
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [box, seen, messages]);
};

export const UnreadLine = ({ lineRef }) => {
  const t = useT();
  return el(
    'div',
    { ref: lineRef, className: 'chat-unread-line', role: 'separator' },
    el('span', null, t('chat.unreadLine'))
  );
};
