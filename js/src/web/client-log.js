// The page's own errors, sent to the local server's log file
// (POST /api/client-log), so one log holds what both sides did: a script
// error, a promise nobody caught. Only the error and where in our code it
// happened are sent, never what the user reads; the same error is sent
// once, and at most twenty a minute. Pictures and files from the server
// that would not load are counted by route and sent together a little
// later: how many and whether loaded from another origin, never which.

import { activeAccount } from './telegram-account-scope.js';
import { MEDIA_LOAD_EVENT } from './media-watch.js';

// Opt-in, local console diagnostics for navigation and pointer delivery.
// No page content or credentials are included by callers.
export const debugBrowser = (event, fields = {}) => {
  if (globalThis.metaSovereignDebug === true) {
    globalThis.console?.debug?.('[ms-debug]', event, JSON.stringify(fields));
  }
};

const PER_MINUTE = 20;
const MEDIA_ROUTE = /\/api\/telegram\/(avatar|media|file)\b/;
const MEDIA_EVERY_MS = 10_000;

/** Always-on workflow diagnostics: identifiers/decisions, never message text. */
export const traceClient = (api, event, fields = {}) => {
  try {
    Promise.resolve(
      api?.clientLog?.({
        level: 'debug',
        event,
        account: activeAccount(),
        ...fields,
      })
    ).catch(() => {});
  } catch {
    /* Diagnostics cannot interrupt a send or queue action. */
  }
};

/** `avatar`, `media` or `file` for a server picture's element, or null. */
export const mediaRouteOf = (target) => {
  const src = target?.currentSrc || target?.src;
  return typeof src === 'string' ? (MEDIA_ROUTE.exec(src)?.[1] ?? null) : null;
};

/** The entry for an error event or a rejection's reason. */
export const errorEntry = (event, cause, view) => ({
  level: 'error',
  event,
  error: String(cause?.message ?? cause ?? 'unknown').slice(0, 300),
  stack: typeof cause?.stack === 'string' ? cause.stack.slice(0, 4000) : null,
  view: view ?? null,
});

/** Report `window` errors through `send`; returns an uninstaller. */
export const installClientLog = ({
  target = globalThis.window,
  send,
  view = () => globalThis.location?.hash?.slice(1, 40) || null,
  now = Date.now,
} = {}) => {
  if (!target?.addEventListener || typeof send !== 'function') {
    return () => {};
  }
  const seen = new Map();
  let windowStart = 0;
  let used = 0;
  const report = (entry) => {
    const key = `${entry.event}:${entry.error}`;
    const at = now();
    if (at - (seen.get(key) ?? -Infinity) < 60_000) {
      return;
    }
    if (now() - windowStart >= 60_000) {
      windowStart = now();
      used = 0;
    }
    used += 1;
    if (used > PER_MINUTE) {
      return;
    }
    seen.delete(key);
    seen.set(key, at);
    if (seen.size > 128) {
      seen.delete(seen.keys().next().value);
    }
    Promise.resolve()
      .then(() => send(entry))
      .catch(() => {});
  };
  let failed = null;
  let failedTimer = null;
  const sendFailed = () => {
    if (!failed) {
      return;
    }
    const count =
      (failed.avatar ?? 0) + (failed.media ?? 0) + (failed.file ?? 0);
    const retrying = count > 0 && failed.retrying === count;
    const fallback = count > 0 && failed.fallback === count;
    const entry = {
      level: retrying || fallback ? 'info' : 'warn',
      event: fallback
        ? 'media_fallback'
        : retrying
          ? 'media_retrying'
          : 'media_failed',
      view: view(),
      ...failed,
    };
    failed = null;
    Promise.resolve()
      .then(() => send(entry))
      .catch(() => {});
  };
  // Resource errors do not bubble: seen on the way down (capture).
  const onResourceError = (event) => {
    const route = mediaRouteOf(event?.target);
    if (!route) {
      return;
    }
    if (!failed) {
      failed = {};
      failedTimer = globalThis.setTimeout(sendFailed, MEDIA_EVERY_MS);
    }
    failed[route] = (failed[route] ?? 0) + 1;
    if (event.target.dataset?.mediaRetrying === 'true') {
      failed.retrying = (failed.retrying ?? 0) + 1;
    }
    if (event.target.dataset?.mediaFallback) {
      failed.fallback = (failed.fallback ?? 0) + 1;
    }
    // crossOrigin describes the request mode, not the cause of failure.
    failed.corsRequested =
      (failed.corsRequested ?? 0) + (event.target.crossOrigin ? 1 : 0);
  };
  const onError = (event) =>
    report(errorEntry('error', event?.error ?? event?.message, view()));
  const onRejection = (event) =>
    report(errorEntry('unhandled_rejection', event?.reason, view()));
  const onMediaLoad = ({ detail }) => {
    if (!['stalled', 'recovered'].includes(detail?.phase)) {
      return;
    }
    report({
      level: 'debug',
      event: `media_${detail.phase}`,
      code: `${['avatar', 'media', 'file'].includes(detail.route) ? detail.route : 'other'}.${['img', 'audio', 'video'].includes(detail.kind) ? detail.kind : 'other'}`,
      view: view(),
      kind: ['img', 'audio', 'video'].includes(detail.kind)
        ? detail.kind
        : 'other',
      route: ['avatar', 'media', 'file'].includes(detail.route)
        ? detail.route
        : 'other',
      durationMs: Math.max(
        0,
        Math.min(Number(detail.durationMs) || 0, 86400000)
      ),
    });
  };
  target.addEventListener('error', onError);
  target.addEventListener('error', onResourceError, true);
  target.addEventListener('unhandledrejection', onRejection);
  target.addEventListener(MEDIA_LOAD_EVENT, onMediaLoad);
  return () => {
    globalThis.clearTimeout(failedTimer);
    failed = null;
    target.removeEventListener('error', onError);
    target.removeEventListener('error', onResourceError, true);
    target.removeEventListener('unhandledrejection', onRejection);
    target.removeEventListener(MEDIA_LOAD_EVENT, onMediaLoad);
  };
};
