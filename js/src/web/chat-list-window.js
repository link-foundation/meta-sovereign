// A measured viewport over the directory, not an ever-growing set of rows.
// Original implementation; Telegram Web A's viewportIds informed the behavior.
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { groupChats } from './chat-model.js';

const el = React.createElement;

export const chatListEntries = (chats, sort, now = Date.now()) =>
  sort === 'oldest'
    ? groupChats(chats, now, sort).flatMap(({ group, chats: rows }) => [
        { key: `heading:${group}`, group },
        ...rows.map((chat) => ({ key: chat.key, chat })),
      ])
    : chats.map((chat) => ({ key: chat.key, chat }));

export const listOffsets = (entries, sizes) => {
  const offsets = [0];
  for (const entry of entries) {
    offsets.push(offsets.at(-1) + (entry.chat ? sizes.chat : sizes.heading));
  }
  return offsets;
};

const indexAt = (offsets, position) => {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (offsets[middle] <= position) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
};

export const listRange = (offsets, top, height) => {
  const count = offsets.length - 1;
  return {
    start: Math.min(count, indexAt(offsets, Math.max(0, top - height))),
    end: Math.min(count, indexAt(offsets, top + height * 2) + 1),
  };
};

const useLatest = (value) => {
  const ref = useRef(value);
  ref.current = value;
  return ref;
};

/** Stable identity for memoized rows, with the handler from the latest view. */
export const useListHandler = (handler) => {
  const ref = useLatest(handler);
  return useMemo(
    () =>
      (...args) =>
        ref.current?.(...args),
    []
  );
};

const useViewport = (root, box, resetKey) => {
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  const [sizes, setSizes] = useState({ chat: 68, heading: 30 });
  // The scroll root belongs to our parent; its ref is attached after the
  // child's layout effects. Subscribe once all refs are committed.
  useEffect(() => {
    const list = root.current;
    const content = box.current;
    if (!list || !content) {
      return undefined;
    }
    let frame;
    const measure = () => {
      const next = {};
      for (const kind of ['chat', 'heading']) {
        const node = content.querySelector(`[data-list-kind="${kind}"]`);
        const height = node?.getBoundingClientRect().height;
        if (height > 0) {
          next[kind] = height;
        }
      }
      setSizes((was) => {
        const measured = { ...was, ...next };
        return Math.abs(was.chat - measured.chat) > 0.5 ||
          Math.abs(was.heading - measured.heading) > 0.5
          ? measured
          : was;
      });
      const top =
        list.getBoundingClientRect().top - content.getBoundingClientRect().top;
      const height = list.clientHeight || 600;
      setViewport((was) =>
        was.top === top && was.height === height ? was : { top, height }
      );
    };
    const schedule = () => {
      globalThis.cancelAnimationFrame(frame);
      frame = globalThis.requestAnimationFrame(measure);
    };
    measure();
    list.addEventListener('scroll', schedule, { passive: true });
    const observer = new globalThis.ResizeObserver(schedule);
    observer.observe(list);
    observer.observe(content);
    globalThis.addEventListener('resize', schedule);
    return () => {
      list.removeEventListener('scroll', schedule);
      globalThis.removeEventListener('resize', schedule);
      observer.disconnect();
      globalThis.cancelAnimationFrame(frame);
    };
  }, [resetKey]);
  useLayoutEffect(() => {
    if (root.current) {
      root.current.scrollTop = 0;
      setViewport((was) => ({ ...was, top: 0 }));
    }
  }, [resetKey]);
  return { viewport, sizes };
};

// Prefetch only the mounted viewport and overscan, never every archived chat.
const useVisibleChats = (root, entries, prefetch) => {
  useEffect(() => {
    const list = root.current;
    if (!list || !prefetch) {
      return undefined;
    }
    const chats = new Map(
      entries
        .filter((entry) => entry.chat)
        .map((entry) => [entry.key, entry.chat])
    );
    const Observer = globalThis.IntersectionObserver;
    if (typeof Observer !== 'function') {
      if (list.clientHeight > 0) {
        chats.forEach(prefetch);
      }
      return undefined;
    }
    const observer = new Observer(
      (visible) => {
        for (const entry of visible) {
          const chat = chats.get(entry.target.dataset.chat);
          if (entry.isIntersecting && chat) {
            prefetch(chat);
          }
        }
      },
      { root: list, rootMargin: '100% 0px' }
    );
    list
      .querySelectorAll('.chat-list-window [data-chat]')
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [root, entries, prefetch]);
};

const nextChatIndex = (entries, index, step) => {
  let next = index + step;
  while (next >= 0 && next < entries.length && !entries[next].chat) {
    next += step;
  }
  return next >= 0 && next < entries.length ? next : null;
};

const keyboardTarget = (entries, index, event) => {
  if (event.key === 'Home') {
    return nextChatIndex(entries, -1, 1);
  }
  if (event.key === 'End') {
    return nextChatIndex(entries, entries.length, -1);
  }
  const backwards =
    event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey);
  return nextChatIndex(entries, index, backwards ? -1 : 1);
};

const useListFocus = (root, box, entries, offsets, range, selected) => {
  const [focus, setFocus] = useState(null);
  const previous = useRef(selected);
  const reveal = (index) => {
    const list = root.current;
    const content = box.current;
    if (!list || !content) {
      return;
    }
    const origin =
      content.getBoundingClientRect().top -
      list.getBoundingClientRect().top +
      list.scrollTop;
    const top = origin + offsets[index];
    const bottom = origin + offsets[index + 1];
    if (top < list.scrollTop) {
      list.scrollTop = top;
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
    list.dispatchEvent(new globalThis.Event('scroll'));
  };
  useLayoutEffect(() => {
    if (selected !== previous.current) {
      previous.current = selected;
      const index = entries.findIndex((entry) => entry.key === selected);
      if (index >= 0) {
        reveal(index);
      }
    }
  }, [selected, entries, offsets]);
  useLayoutEffect(() => {
    if (focus !== null) {
      const node = box.current?.querySelector(
        `[data-list-index="${focus}"] button`
      );
      if (node) {
        node.focus({ preventScroll: true });
        setFocus(null);
      }
    }
  }, [focus, range.start, range.end]);
  return (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const slot = event.target.closest('[data-list-index]');
    if (
      !slot ||
      !['Tab', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
    ) {
      return;
    }
    const index = Number(slot.dataset.listIndex);
    const next = keyboardTarget(entries, index, event);
    if (
      next !== null &&
      (event.key !== 'Tab' || next < range.start || next >= range.end)
    ) {
      event.preventDefault();
      setFocus(next);
      reveal(next);
    }
  };
};

export const VirtualChats = ({
  root,
  chats,
  sort,
  resetKey,
  selected,
  item,
  prefetch,
  t,
}) => {
  const box = useRef(null);
  const entries = useMemo(() => chatListEntries(chats, sort), [chats, sort]);
  const { viewport, sizes } = useViewport(root, box, resetKey);
  const offsets = useMemo(() => listOffsets(entries, sizes), [entries, sizes]);
  const range = listRange(offsets, viewport.top, viewport.height);
  const shown = useMemo(
    () => entries.slice(range.start, range.end),
    [entries, range.start, range.end]
  );
  useVisibleChats(root, shown, prefetch);
  const onKeyDown = useListFocus(root, box, entries, offsets, range, selected);
  return el('div', { ref: box, className: 'chat-list-window', onKeyDown }, [
    el('div', {
      key: 'before',
      'aria-hidden': true,
      style: { height: offsets[range.start] },
    }),
    ...shown.map((entry, at) =>
      el(
        'div',
        {
          key: entry.key,
          className: 'chat-list-slot',
          'data-list-kind': entry.chat ? 'chat' : 'heading',
          'data-list-index': range.start + at,
        },
        entry.chat
          ? item(entry.chat)
          : el(
              'h3',
              { className: 'chat-list-heading' },
              t(`chat.group.${entry.group}`)
            )
      )
    ),
    el('div', {
      key: 'after',
      'aria-hidden': true,
      style: { height: offsets.at(-1) - offsets[range.end] },
    }),
  ]);
};
