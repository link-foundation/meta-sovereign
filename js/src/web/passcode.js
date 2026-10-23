// The local passcode on the page (R-Y183; learned from Telegram Desktop,
// never copied): the full-screen unlock screen, the lock itself (Ctrl+L /
// Cmd+L, "Lock now", and the auto-lock after an idle period measured from
// the page's last user input). The server keeps the hash and refuses its
// routes while locked (../server/routes-passcode.js); this only asks it.
// A passcode lives in a field's state until it is sent and is never stored
// or logged by the page.

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.js';
import { useT } from './i18n.js';

const el = React.createElement;

/** Sent by dom.js when the server answers 423 (locked). */
export const LOCKED_EVENT = 'meta-sovereign:locked';
/** Sent by the settings after any change, and by "Lock now". */
export const PASSCODE_CHANGED = 'meta-sovereign:passcode-changed';
export const LOCK_NOW = 'meta-sovereign:lock-now';

/** The idle periods of the auto-lock in minutes; 0 is off. */
export const AUTO_LOCK_CHOICES = Object.freeze([0, 1, 5, 60, 300]);

/** Whether the page has been idle for the whole auto-lock period. */
export const idleExpired = (lastInput, now, minutes) =>
  minutes > 0 && now - lastInput >= minutes * 60_000;

/** Whether a key press is the lock shortcut: Ctrl+L, or Cmd+L on a Mac. */
export const isLockKey = (event) =>
  Boolean(event.ctrlKey || event.metaKey) &&
  !event.altKey &&
  !event.shiftKey &&
  String(event.key).toLowerCase() === 'l';

const INPUTS = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'];

/**
 * The page's lock: `{ phase: 'loading' | 'open' | 'locked', status, lock }`.
 * Locked pages show the unlock screen instead of the app.
 */
export const useLocalLock = (api) => {
  const [state, setState] = useState({ phase: 'loading', status: null });
  const lastInput = useRef(Date.now());
  const refresh = () =>
    api
      .passcode('status')
      .then((status) =>
        setState({
          phase: status?.locked ? 'locked' : 'open',
          status: status ?? null,
        })
      )
      .catch(() => setState({ phase: 'open', status: null }));
  const lock = () =>
    api
      .passcode('lock', {})
      .then((r) => r?.ok && setState((s) => ({ ...s, phase: 'locked' })));
  const latest = useRef({ lock, status: state.status, phase: state.phase });
  latest.current = { lock, status: state.status, phase: state.phase };

  useEffect(() => {
    refresh();
    const onLocked = () => setState((s) => ({ ...s, phase: 'locked' }));
    const onKey = (event) => {
      if (latest.current.status?.enabled && isLockKey(event)) {
        event.preventDefault();
        latest.current.lock();
      }
    };
    const onNow = () => latest.current.lock();
    globalThis.addEventListener(LOCKED_EVENT, onLocked);
    globalThis.addEventListener(PASSCODE_CHANGED, refresh);
    globalThis.addEventListener(LOCK_NOW, onNow);
    globalThis.addEventListener('keydown', onKey);
    return () => {
      globalThis.removeEventListener(LOCKED_EVENT, onLocked);
      globalThis.removeEventListener(PASSCODE_CHANGED, refresh);
      globalThis.removeEventListener(LOCK_NOW, onNow);
      globalThis.removeEventListener('keydown', onKey);
    };
  }, []);

  // The auto-lock: the last user input starts the wait.
  const minutes = state.status?.enabled ? state.status.autoLockMinutes : 0;
  useEffect(() => {
    if (!minutes || state.phase !== 'open') {
      return undefined;
    }
    lastInput.current = Date.now();
    const touch = () => {
      lastInput.current = Date.now();
    };
    for (const name of INPUTS) {
      globalThis.addEventListener(name, touch, { passive: true });
    }
    const timer = globalThis.setInterval(() => {
      if (idleExpired(lastInput.current, Date.now(), minutes)) {
        latest.current.lock();
      }
    }, 1000);
    return () => {
      globalThis.clearInterval(timer);
      for (const name of INPUTS) {
        globalThis.removeEventListener(name, touch);
      }
    };
  }, [minutes, state.phase]);

  return { phase: state.phase, status: state.status, lock };
};

/** Seconds to wait as the countdown of a rate-limited try. */
export const secondsOf = (ms) => Math.max(1, Math.ceil((ms ?? 0) / 1000));

/** The full-screen unlock screen. */
export const LockScreen = ({ api }) => {
  const t = useT();
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!waitUntil) {
      return undefined;
    }
    const timer = globalThis.setInterval(() => tick((n) => n + 1), 250);
    return () => globalThis.clearInterval(timer);
  }, [waitUntil]);
  const waiting = waitUntil > Date.now();
  const submit = async (event) => {
    event.preventDefault();
    if (busy || waiting) {
      return;
    }
    setBusy(true);
    const answer = await api
      .passcode('unlock', { passcode: value })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      // A fresh page: its streams and data start again, now unlocked.
      globalThis.location.reload();
      return;
    }
    setValue('');
    if (answer?.retryAfterMs > 0) {
      setWaitUntil(Date.now() + answer.retryAfterMs);
    }
    setProblem(
      answer?.code === 'wrong' || answer?.code === 'rate-limited'
        ? answer.code
        : 'failed'
    );
  };
  const seconds = secondsOf(waitUntil - Date.now());
  return el(
    'div',
    {
      className: 'lock-screen',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('passcode.lockedTitle'),
      'data-screen': 'locked',
    },
    el('form', { className: 'lock-card', onSubmit: submit }, [
      el(Icon, { key: 'i', name: 'lock', size: 40 }),
      el('h2', { key: 'h' }, t('passcode.lockedTitle')),
      el('p', { key: 'p', className: 'meta' }, t('passcode.lockedHint')),
      el('input', {
        key: 'f',
        type: 'password',
        name: 'passcode',
        'data-field': 'unlock-passcode',
        autoFocus: true,
        autoComplete: 'current-password',
        maxLength: 256,
        placeholder: t('passcode.field'),
        'aria-label': t('passcode.field'),
        value,
        onChange: (e) => setValue(e.target.value),
      }),
      problem
        ? el(
            'p',
            { key: 'e', className: 'chat-form-error', role: 'alert' },
            waiting
              ? t('passcode.err.wait', { seconds })
              : t(
                  `passcode.err.${problem === 'rate-limited' ? 'wrong' : problem}`
                )
          )
        : null,
      el(
        'button',
        {
          key: 'b',
          type: 'submit',
          'data-action': 'unlock',
          disabled: busy || waiting || !value,
        },
        t('passcode.unlock')
      ),
    ])
  );
};
