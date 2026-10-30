import { traceClient } from './client-log.js';
import { useCallback, useEffect, useMemo, useRef } from 'react';

// Transition-only geometry: no message text, DOM dumps, per-frame observers or
// archive reads. A real overlap at the live tail is a warning, not a read position.
export const createLayoutTrace = (api) => {
  let previous = null;
  return {
    sample(node, fields) {
      const composer = node
        ?.closest('.chat-main')
        ?.querySelector('.chat-composer');
      if (!node || !composer) {
        return;
      }
      const rows = node.querySelectorAll('.bubble-row');
      const row = rows[rows.length - 1];
      const viewport = node.getBoundingClientRect();
      const top = composer.getBoundingClientRect().top;
      const gap = row ? top - row.getBoundingClientRect().bottom : null;
      const geometry = {
        ...fields,
        scrollTop: Math.round(node.scrollTop),
        scrollHeight: node.scrollHeight,
        viewportHeight: node.clientHeight,
        viewportBottom: Math.round(viewport.bottom),
        composerTop: Math.round(top),
        composerHeight: composer.offsetHeight,
        reserve: Number.parseFloat(
          globalThis.getComputedStyle(node).paddingBottom
        ),
        bottomGap: gap === null ? 0 : Math.round(gap),
        overlap: Boolean(row && fields.following && gap < -2),
      };
      const key = JSON.stringify(geometry);
      if (key === previous) {
        return;
      }
      previous = key;
      traceClient(api, 'chat_layout', {
        ...geometry,
        level: geometry.overlap ? 'warn' : 'debug',
      });
    },
  };
};

export const useLayoutTrace = (api, box, state, following) => {
  const trace = useMemo(() => createLayoutTrace(api), [api]);
  const latest = useRef(state);
  latest.current = state;
  const frame = useRef(null);
  useEffect(() => () => globalThis.cancelAnimationFrame(frame.current), []);
  return useCallback(
    (reason) => {
      globalThis.cancelAnimationFrame(frame.current);
      // Allow composer sizing and the follow observer to settle before warning.
      frame.current = globalThis.requestAnimationFrame(() => {
        frame.current = globalThis.requestAnimationFrame(() => {
          const current = latest.current;
          trace.sample(box.current, {
            reason,
            chat: current.current?.chat,
            source: current.current?.source,
            following: following.current,
            messages: current.messages.length,
            drafts: current.drafts?.drafts?.length ?? 0,
            pending: Boolean(current.messages.at(-1)?.pending),
          });
        });
      });
    },
    [trace, box, following]
  );
};
