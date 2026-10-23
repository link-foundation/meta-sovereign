// Settings → Privacy and Security → Local passcode (R-Y183; learned from
// Telegram Desktop, never copied): turn on with a passcode typed twice,
// change it, turn it off (asking the current one), choose the auto-lock
// period and lock at once. Only the server keeps a salted hash; a passcode
// lives in these fields until it is sent and is cleared right after.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import {
  AUTO_LOCK_CHOICES,
  LOCK_NOW,
  PASSCODE_CHANGED,
  secondsOf,
} from './passcode.js';

const el = React.createElement;

const EMPTY = { current: '', passcode: '', repeat: '' };
const FIELDS = {
  on: ['passcode', 'repeat'],
  change: ['current', 'passcode', 'repeat'],
  off: ['current'],
};

/** What is wrong with a passcode form, as an error code, or null. */
export const passcodeProblem = (form, mode) => {
  if (mode !== 'on' && !form.current) {
    return 'need-current';
  }
  if (mode === 'off') {
    return null;
  }
  if (!form.passcode) {
    return 'need-passcode';
  }
  if (form.passcode !== form.repeat) {
    return 'mismatch';
  }
  return mode === 'change' && form.passcode === form.current ? 'same' : null;
};

const Btn = ({ name, children, ...props }) =>
  el('button', { type: 'button', 'data-action': name, ...props }, children);

const failure = (t, answer) =>
  answer?.code === 'wrong'
    ? t('passcode.err.wrongCurrent')
    : answer?.code === 'rate-limited'
      ? t('passcode.err.wait', { seconds: secondsOf(answer.retryAfterMs) })
      : t('passcode.err.failed');

const useStatus = (api) => {
  const [status, setStatus] = useState(undefined);
  const load = () =>
    api
      .passcode('status')
      .then((s) => setStatus(s ?? null))
      .catch(() => setStatus(null));
  useEffect(() => {
    load();
  }, []);
  return { status, reload: load };
};

const Form = ({ t, mode, form, setForm, go, busy, cancel }) =>
  el('div', { className: 'security-form' }, [
    ...FIELDS[mode].map((name) =>
      el('label', { key: name, className: 'chat-form-field' }, [
        el(
          'span',
          { key: 'l', className: 'meta' },
          t(`passcode.field.${name}`)
        ),
        el('input', {
          key: 'i',
          type: 'password',
          maxLength: 256,
          'data-field': `passcode-${name}`,
          autoComplete:
            name === 'current' ? 'current-password' : 'new-password',
          value: form[name],
          onChange: (e) => setForm({ ...form, [name]: e.target.value }),
          onKeyDown: (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              go();
            }
          },
        }),
      ])
    ),
    el('div', { key: 'b', className: 'security-buttons' }, [
      el(
        Btn,
        {
          key: 's',
          name: 'passcode-save',
          className: mode === 'off' ? 'danger' : undefined,
          disabled: busy,
          onClick: go,
        },
        t(mode === 'off' ? 'passcode.turnOff' : 'chat.security.save')
      ),
      el(
        Btn,
        { key: 'x', name: 'passcode-cancel', onClick: cancel },
        t('chat.privacy.confirmNo')
      ),
    ]),
  ]);

const AutoLock = ({ api, t, status, reload, setError }) =>
  el('label', { className: 'privacy-label' }, [
    el('span', { key: 't' }, t('passcode.autoLock')),
    el(
      'select',
      {
        key: 's',
        'data-field': 'passcode-auto-lock',
        value: String(status.autoLockMinutes),
        onChange: async (e) => {
          const answer = await api.passcode('auto-lock', {
            minutes: Number(e.target.value),
          });
          setError(answer?.ok ? null : t('passcode.err.failed'));
          globalThis.dispatchEvent(new globalThis.Event(PASSCODE_CHANGED));
          reload();
        },
      },
      AUTO_LOCK_CHOICES.map((m) =>
        el('option', { key: m, value: String(m) }, t(`passcode.auto.${m}`))
      )
    ),
  ]);

/** The section's body. */
export const LocalPasscode = ({ api, setError }) => {
  const t = useT();
  const { status, reload } = useStatus(api);
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  if (status === undefined) {
    return el('p', { className: 'meta' }, t('chat.privacy.loading'));
  }
  if (status === null) {
    return el('p', { className: 'meta' }, t('passcode.err.failed'));
  }
  const open = (next) => {
    setMode(next);
    setForm(EMPTY);
    setError(null);
    setNote(null);
  };
  const save = async () => {
    const problem = passcodeProblem(form, mode);
    if (problem) {
      setError(t(`passcode.err.${problem}`));
      return;
    }
    setBusy(true);
    const answer =
      mode === 'off'
        ? await api.passcode('remove', { passcode: form.current })
        : await api.passcode('set', {
            passcode: form.passcode,
            ...(mode === 'change' ? { current: form.current } : {}),
          });
    setBusy(false);
    if (!answer?.ok) {
      setForm({ ...form, current: '' });
      setError(failure(t, answer));
      return;
    }
    setForm(EMPTY);
    setError(null);
    setNote(t(`passcode.done.${mode}`));
    setMode(null);
    globalThis.dispatchEvent(new globalThis.Event(PASSCODE_CHANGED));
    reload();
  };
  return el('div', { className: 'security-two-step' }, [
    el(
      'p',
      {
        key: 's',
        className: 'meta',
        'data-passcode': status.enabled ? 'on' : 'off',
      },
      t(status.enabled ? 'passcode.on' : 'passcode.off')
    ),
    el('p', { key: 'h', className: 'meta' }, t('passcode.hint')),
    note
      ? el('p', { key: 'n', className: 'meta', role: 'status' }, note)
      : null,
    mode
      ? el(Form, {
          key: 'f',
          t,
          mode,
          form,
          setForm,
          go: save,
          busy,
          cancel: () => open(null),
        })
      : el(
          'div',
          { key: 'o', className: 'security-buttons' },
          status.enabled
            ? [
                el(
                  Btn,
                  {
                    key: 'c',
                    name: 'passcode-change',
                    onClick: () => open('change'),
                  },
                  t('passcode.change')
                ),
                el(
                  Btn,
                  {
                    key: 'x',
                    name: 'passcode-off',
                    onClick: () => open('off'),
                  },
                  t('passcode.turnOff')
                ),
                el(
                  Btn,
                  {
                    key: 'l',
                    name: 'lock-now',
                    onClick: () =>
                      globalThis.dispatchEvent(new globalThis.Event(LOCK_NOW)),
                  },
                  t('passcode.lockNow')
                ),
              ]
            : el(
                Btn,
                { name: 'passcode-on', onClick: () => open('on') },
                t('passcode.turnOn')
              )
        ),
    status.enabled && !mode
      ? el(AutoLock, { key: 'a', api, t, status, reload, setError })
      : null,
  ]);
};
