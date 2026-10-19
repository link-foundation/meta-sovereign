// A message that leaves the open chat — deleted here, on another device
// or by the other side, on any network — goes the way it does in
// Telegram's own web app (telegram-tt's `is-deleting`): the bubble
// shrinks toward its side of the chat and fades (200 ms), then the place
// it took closes (to 350 ms, Telegram's ANIMATION_DELAY), so the
// messages around it meet with no space left between them. Only then
// does it leave the list. With reduced motion it goes at once.

import { useEffect, useMemo, useRef, useState } from 'react';

export const LEAVE_MS = 350;
// The bubble shrinks first; its place closes after it starts to.
const CLOSE_DELAY_MS = 120;

const identity = (message) => message?.clientId ?? message?.id ?? null;

const reducedMotion = () =>
  Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

/** How long a leaving message stays: none with reduced motion. */
export const leaveMs = () => (reducedMotion() ? 0 : LEAVE_MS);

/**
 * `next`, with each message of `before` that is not in it put back where
 * it was, marked `leaving` (a message that was sent and arrived keeps
 * its `clientId`, so it is not one that left).
 */
export const keepLeaving = (before = [], next = []) => {
  const ids = new Set(next.map(identity));
  if (before.every((m) => ids.has(identity(m)))) {
    return next;
  }
  const out = [...next];
  let anchor = -1;
  for (const message of before) {
    const id = identity(message);
    if (ids.has(id)) {
      anchor = out.findIndex((m) => identity(m) === id);
      continue;
    }
    anchor += 1;
    out.splice(
      anchor,
      0,
      message.leaving ? message : { ...message, leaving: true }
    );
  }
  return out;
};

/**
 * The open chat's messages to draw: `messages`, and for LEAVE_MS each
 * one that just left it, in its place (see `keepLeaving`). Opening
 * another chat shows it as it is.
 */
export const useLeaving = (messages, key) => {
  const [tick, setTick] = useState(0);
  const last = useRef({ key, list: messages, ends: new Map() });
  const list = useMemo(() => {
    const before = last.current;
    const ms = leaveMs();
    if (before.key !== key || ms === 0) {
      last.current = { key, list: messages, ends: new Map() };
      return messages;
    }
    const now = Date.now();
    const ends = new Map([...before.ends].filter(([, end]) => end > now));
    const kept = before.list.filter((m) => !m.leaving || ends.has(identity(m)));
    const merged = keepLeaving(kept, messages);
    for (const m of merged) {
      if (m.leaving && !ends.has(identity(m))) {
        ends.set(identity(m), now + ms);
      }
    }
    last.current = { key, list: merged, ends };
    return merged;
  }, [messages, key, tick]);
  const ends = last.current.ends;
  useEffect(() => {
    if (ends.size === 0) {
      return undefined;
    }
    const wait = Math.max(0, Math.min(...ends.values()) - Date.now());
    const timer = globalThis.setTimeout(() => setTick((n) => n + 1), wait);
    return () => globalThis.clearTimeout(timer);
  }, [list, ends]);
  return list;
};

/**
 * Close the place of a leaving row: its height and the column's gap
 * after it go to nothing while its bubble shrinks (app.css
 * `.is-leaving`).
 */
export const closePlace = (node, ms = leaveMs()) => {
  if (!node || typeof node.animate !== 'function' || ms === 0) {
    return null;
  }
  const height = node.getBoundingClientRect().height;
  const parent = node.parentElement;
  const gap = parent
    ? Number.parseFloat(globalThis.getComputedStyle(parent).rowGap) || 0
    : 0;
  return node.animate(
    [
      { height: `${height}px`, marginBottom: '0px' },
      { height: '0px', marginBottom: `${-gap}px` },
    ],
    {
      duration: ms - CLOSE_DELAY_MS,
      delay: CLOSE_DELAY_MS,
      easing: 'ease-in-out',
      fill: 'forwards',
    }
  );
};
