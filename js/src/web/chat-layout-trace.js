import { debugBrowser, traceClient } from './client-log.js';
import { useCallback, useEffect, useMemo, useRef } from 'react';

// Transition-only geometry: no message text, DOM dumps, per-frame observers or
// archive reads. A real overlap at the live tail is a warning, not a read position.
export const readLayoutGeometry = (node, fields) => {
  const composer = node?.closest('.chat-main')?.querySelector('.chat-composer');
  if (!node || !composer) {
    return;
  }
  const rows = node.querySelectorAll('.bubble-row');
  const row = rows[rows.length - 1];
  const viewport = node.getBoundingClientRect();
  const top = composer.getBoundingClientRect().top;
  const gap = row ? top - row.getBoundingClientRect().bottom : null;
  return {
    ...fields,
    scrollTop: Math.round(node.scrollTop),
    scrollHeight: node.scrollHeight,
    viewportHeight: node.clientHeight,
    viewportBottom: Math.round(viewport.bottom),
    composerTop: Math.round(top),
    composerHeight: composer.offsetHeight,
    reserve: Number.parseFloat(globalThis.getComputedStyle(node).paddingBottom),
    bottomGap: gap === null ? 0 : Math.round(gap),
    overlap: Boolean(row && fields.following && gap < -2),
  };
};

export const createLayoutTrace = (api) => {
  let previous = null;
  let lastAt = -Infinity;
  let flags = '';
  return {
    sample(node, fields) {
      const geometry = readLayoutGeometry(node, fields);
      if (!geometry) {
        return;
      }
      const key = JSON.stringify(geometry);
      if (key === previous) {
        return;
      }
      previous = key;
      const nextFlags = `${geometry.following}:${geometry.overlap}:${geometry.messages}:${geometry.drafts}:${geometry.pending}`;
      const changed = flags !== nextFlags;
      flags = nextFlags;
      // Rapid keystrokes can alternate composer heights. Keep transition and
      // overlap evidence without exhausting the shared error-report budget.
      if (!changed && Date.now() - lastAt < 5000) {
        return;
      }
      lastAt = Date.now();
      traceClient(api, 'chat_layout', {
        ...geometry,
        level: geometry.overlap ? 'warn' : 'debug',
      });
    },
  };
};

// Animation frames run before ResizeObserver delivery. A commit during the
// first frame can therefore leave the second sample ahead of tail correction.
// Confirm a potential warning after that delivery, using the latest state.
export const createLayoutReporter = (trace, snapshot) => {
  let frame = null;
  const cancel = () => globalThis.cancelAnimationFrame(frame);
  const sample = (reason) => {
    const { node, fields } = snapshot(reason);
    trace.sample(node, fields);
  };
  return {
    cancel,
    report(reason) {
      cancel();
      frame = globalThis.requestAnimationFrame(() => {
        frame = globalThis.requestAnimationFrame(() => {
          const { node, fields } = snapshot(reason);
          const candidate = readLayoutGeometry(node, fields);
          if (candidate?.overlap) {
            debugBrowser('chat_layout_pending', candidate);
            frame = globalThis.requestAnimationFrame(() => sample(reason));
          } else {
            trace.sample(node, fields);
          }
        });
      });
    },
  };
};

export const useLayoutTrace = (api, box, state, following) => {
  const trace = useMemo(() => createLayoutTrace(api), [api]);
  const latest = useRef(state);
  latest.current = state;
  const reporter = useMemo(
    () =>
      createLayoutReporter(trace, (reason) => {
        const current = latest.current;
        return {
          node: box.current,
          fields: {
            reason,
            chat: current.current?.chat,
            source: current.current?.source,
            following: following.current,
            messages: current.messages.length,
            drafts: current.drafts?.drafts?.length ?? 0,
            pending: Boolean(current.messages.at(-1)?.pending),
          },
        };
      }),
    [trace, box, following]
  );
  useEffect(() => reporter.cancel, [reporter]);
  return useCallback((reason) => reporter.report(reason), [reporter]);
};
