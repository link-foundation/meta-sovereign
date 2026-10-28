// Actionable server refusals are logged once and shown to their owner.
// Transport interruptions are recovery diagnostics, never error toasts.
// POST-based readers have the same quiet loading behavior as GET readers.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { PageLoading } from './spinner.js';
import { isConnectionFailure, isReadRequest } from './request-policy.js';

const el = React.createElement;

export const API_ERROR_EVENT = 'ms-api-error';

// Codes with their own wording (error.code.<code> in every locale).
export const KNOWN_CODES = [
  'bad-host',
  'too-large',
  'bad-json',
  'internal',
  'send-unknown',
  'unsupported',
  'unsupported-chat',
  'captcha',
  'LOW_DISK',
  'STORE_WRITE_FAILED',
  'STORE_FULL',
  'STORE_LOCKED',
  'outbox-unavailable',
  'send-in-doubt',
  'timeout',
  'network',
];

// Never a toast: a feature probe or a chat that cannot do it is explained
// inline by the panel that asked. Codes outside KNOWN_CODES are the panels'.
const INLINE_ONLY = new Set(['unsupported', 'unsupported-chat']);

const seen = new Set();

/** The localised sentence for a server code, else the server's own text. */
export const errorText = (t, code, fallback = '') => {
  const key = `error.code.${code}`;
  const text = code ? t(key) : key;
  return text === key ? fallback || t('error.code.unknown') : text;
};

/** The `{ code, error }` of a failed answer, or null when it succeeded. */
export const failureOf = (status, data) => {
  if (
    data?.ok === false ||
    (typeof data?.error === 'string' && status >= 400)
  ) {
    return { code: data.code ?? '', error: String(data.error ?? '') };
  }
  return status >= 500 ? { code: 'internal', error: '' } : null;
};

/** Logs once per distinct error; raises the toast for user-triggered calls. */
export const reportApiFailure = ({ path, method = 'GET', status, data }) => {
  const failure = failureOf(status, data);
  if (!failure) {
    return null;
  }
  const key = `${method} ${path} ${failure.code} ${failure.error}`;
  if (!seen.has(key)) {
    seen.add(key);
    const log = isConnectionFailure(failure.code) ? 'debug' : 'warn';
    globalThis.console?.[log]?.(
      `[meta-sovereign] ${method} ${path} failed (${status}): ${failure.code} ${failure.error}`.trim()
    );
  }
  if (
    !isReadRequest(path, method) &&
    !isConnectionFailure(failure.code) &&
    KNOWN_CODES.includes(failure.code) &&
    !INLINE_ONLY.has(failure.code)
  ) {
    globalThis.dispatchEvent?.(
      new CustomEvent(API_ERROR_EVENT, { detail: { ...failure, path } })
    );
  }
  return failure;
};

/** Forgets what was logged (tests). */
export const resetApiErrors = () => seen.clear();

/** The toast, mounted once in the app; Escape or × hides it. */
export const ApiErrorToast = () => {
  const t = useT();
  const [shown, setShown] = useState(null);
  useEffect(() => {
    const on = (event) => {
      if (!isConnectionFailure(event.detail?.code)) {
        setShown(event.detail);
      }
    };
    globalThis.addEventListener?.(API_ERROR_EVENT, on);
    return () => globalThis.removeEventListener?.(API_ERROR_EVENT, on);
  }, []);
  if (!shown) {
    return null;
  }
  return el(
    'aside',
    {
      className: 'disk-banner api-error-toast',
      role: 'alert',
      'data-banner': 'api-error',
      'data-error-code': shown.code,
    },
    [
      el('span', { key: 'text' }, errorText(t, shown.code, shown.error)),
      el(
        'button',
        {
          key: 'x',
          type: 'button',
          'data-action': 'api-error-dismiss',
          onClick: () => setShown(null),
        },
        t('disk.dismiss')
      ),
    ]
  );
};

/** Logs a background failure to the console once per distinct message. */
export const logOnce = (what, error) => {
  const key = `${what} ${String(error?.message ?? error)}`;
  if (!seen.has(key)) {
    seen.add(key);
    const level = isConnectionFailure(error?.code) ? 'debug' : 'warn';
    globalThis.console?.[level]?.(`[meta-sovereign] ${key}`);
  }
};

/** Failed reads keep loading while their owner retries; details stay available. */
export const LoadError = ({ error, what }) => {
  const t = useT();
  const code = typeof error === 'object' ? error?.code : '';
  return el(PageLoading, {
    'data-load-error': what ?? 'list',
    title: errorText(t, code, String(error?.message ?? error ?? '')),
  });
};
