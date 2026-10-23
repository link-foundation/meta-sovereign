// How the message list follows its messages, moved out of chat-view.js:
// staying at the bottom as messages arrive, keeping the reader's place
// when older ones load above, asking for older ones near the top, and
// noting which messages were seen, with the unread line.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Spinner } from './spinner.js';

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

// A page added above keeps what the user reads where it was: the
// distance to the bottom stays the same.
export const useKeepPlace = (box, state) => {
  const fromBottom = useRef(0);
  const first = useRef({ key: null, id: null });
  useLayoutEffect(() => {
    const node = box.current;
    if (!node || typeof node.scrollHeight !== 'number') {
      return;
    }
    const key = state.current?.key ?? null;
    const id = state.messages[0]?.id ?? null;
    if (
      first.current.key === key &&
      first.current.id !== null &&
      first.current.id !== id &&
      node.scrollHeight > 0
    ) {
      node.scrollTop = node.scrollHeight - fromBottom.current;
    }
    first.current = { key, id };
    fromBottom.current = node.scrollHeight - node.scrollTop;
  });
  return () => {
    const node = box.current;
    if (node) {
      fromBottom.current = node.scrollHeight - node.scrollTop;
    }
  };
};

export const OlderRow = ({ history }) => {
  const t = useT();
  if (!history?.older && !history?.loading) {
    return null;
  }
  return el(
    'div',
    {
      className: 'chat-older',
      role: 'status',
      // A failed load is asked again by itself (R-Y96): the arc stays.
      'data-older': history.failed ? 'retrying' : 'loading',
    },
    [
      // Telegram shows the arc alone above the messages.
      el(Spinner, { key: 's' }),
      el('span', { key: 't', className: 'sr-only' }, t('chat.loadingEarlier')),
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
  useEffect(() => {
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
    waitLine.current = opened && !line.current;
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
