// The security extras of Settings → Privacy and Security (R-Y177; learned,
// never copied): two-step verification (set, change and remove a cloud
// password, a hint, a recovery email with its code), the account's
// self-destruct ("If away for"), sensitive content filtering, and for each
// active session the "Accept secret chats" / "Accept calls" switches and
// the inactivity period after which old sessions end. Every write is sent
// only by an explicit Save or confirm click; a password or a code lives only
// in the form's state and is cleared as soon as it has been sent.

import React, { useCallback, useEffect, useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

/** The self-destruct periods: months, as the days Telegram holds. */
export const ACCOUNT_MONTHS = Object.freeze([1, 3, 6, 12, 18, 24]);
const ACCOUNT_DAYS = new Map([
  [1, 30],
  [3, 90],
  [6, 180],
  [12, 365],
  [18, 548],
  [24, 730],
]);
/** The inactivity periods for old sessions, in days. */
export const SESSION_DAYS = Object.freeze([7, 30, 90, 180, 365]);

/** The days of a number of months. */
export const daysOfMonths = (months) => ACCOUNT_DAYS.get(months) ?? null;

/** The months of the days Telegram holds; null for an odd period. */
export const monthsOfDays = (days) =>
  [...ACCOUNT_DAYS].find(([, d]) => d === days)?.[0] ?? null;

/** A Telegram refusal's code as text. */
export const errorText = (t, code) => {
  const key = `chat.security.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.privacy.err.failed') : text;
};

/**
 * What is wrong with a password form, as the code of its message, or null
 * when it can be sent. `has` is whether a password is already set.
 */
export const passwordProblem = (form, has) => {
  if (has && !form.current) {
    return 'need-current';
  }
  if (!form.password) {
    return 'need-password';
  }
  if (form.password !== form.repeat) {
    return 'mismatch';
  }
  if (has && form.password === form.current) {
    return 'same-password';
  }
  if (
    form.hint &&
    form.hint.toLowerCase().includes(form.password.toLowerCase())
  ) {
    return 'hint-is-password';
  }
  return null;
};

/** The security state, read once; `reload` asks again. */
export const useSecurity = (api) => {
  const [state, setState] = useState({ phase: 'loading' });
  const load = useCallback(() => {
    api
      .telegramSecurity()
      .then((a) =>
        setState(
          a?.ok
            ? { phase: 'ready', data: a }
            : { phase: 'error', code: a?.code ?? 'failed' }
        )
      )
      .catch(() => setState({ phase: 'error', code: 'failed' }));
  }, [api]);
  useEffect(() => load(), [load]);
  return {
    state,
    reload: load,
    patch: (data) => setState({ phase: 'ready', data }),
  };
};

const Wait = ({ t, sec }) =>
  sec.state.phase === 'loading'
    ? el('p', { className: 'meta' }, t('chat.privacy.loading'))
    : el('p', { className: 'chat-form-error' }, errorText(t, sec.state.code));

// A button that is not a submit button (these live inside the dialog's
// form).
const Button = ({ name, children, ...props }) =>
  el('button', { type: 'button', 'data-action': name, ...props }, children);

const EMPTY = {
  current: '',
  password: '',
  repeat: '',
  hint: '',
  email: '',
  code: '',
};

// Enter in a field sends this panel's own main button, never the dialog's.
const enterTo = (go) => (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    go();
  }
};

const PasswordField = ({ name, label, form, set, go, kind = 'password' }) =>
  el('label', { className: 'chat-form-field' }, [
    el('span', { key: 'l', className: 'meta' }, label),
    el('input', {
      key: 'i',
      type: kind,
      name,
      'data-field': `two-step-${name}`,
      value: form[name],
      autoComplete: name === 'current' ? 'current-password' : 'new-password',
      maxLength: name === 'hint' ? 255 : 256,
      onChange: (e) => set({ ...form, [name]: e.target.value }),
      onKeyDown: enterTo(go),
    }),
  ]);

const FIELDS = {
  set: ['password', 'repeat', 'hint', 'email'],
  change: ['current', 'password', 'repeat', 'hint', 'email'],
  remove: ['current'],
};

const FormFields = ({ t, mode, form, set, go }) =>
  FIELDS[mode].map((name) =>
    el(PasswordField, {
      key: name,
      name,
      form,
      set,
      go,
      kind: name === 'hint' ? 'text' : name === 'email' ? 'email' : 'password',
      label: t(`chat.security.field.${name}`),
    })
  );

const CodeForm = ({ t, form, set, busy, confirm, resend, cancel, length }) =>
  el('div', { className: 'security-code', 'data-security-code': true }, [
    el('p', { key: 'h', className: 'meta' }, t('chat.security.codeHint')),
    el('label', { key: 'f', className: 'chat-form-field' }, [
      el(
        'span',
        { key: 'l', className: 'meta' },
        t('chat.security.field.code')
      ),
      el('input', {
        key: 'i',
        type: 'text',
        inputMode: 'numeric',
        autoComplete: 'one-time-code',
        'data-field': 'two-step-code',
        maxLength: length || 16,
        value: form.code,
        onChange: (e) => set({ ...form, code: e.target.value.trim() }),
        onKeyDown: enterTo(confirm),
      }),
    ]),
    el('div', { key: 'b', className: 'security-buttons' }, [
      el(
        Button,
        {
          key: 'c',
          name: 'password-code-confirm',
          disabled: busy || !form.code,
          onClick: confirm,
        },
        t('chat.security.codeConfirm')
      ),
      el(
        Button,
        {
          key: 'r',
          name: 'password-code-resend',
          disabled: busy,
          onClick: resend,
        },
        t('chat.security.codeResend')
      ),
      el(
        Button,
        {
          key: 'x',
          name: 'password-code-cancel',
          disabled: busy,
          onClick: cancel,
        },
        t('chat.security.codeCancel')
      ),
    ]),
  ]);

// The calls the form makes; the secrets leave the state as they are sent.
const useTwoStep = ({ api, t, setError, sec }) => {
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [length, setLength] = useState(0);
  const pending = sec.state.data?.password?.emailPending;
  const finish = (message) => {
    setForm(EMPTY);
    setMode(null);
    setNote(message ? t(message) : null);
    sec.reload();
  };
  const run = async (call, onOk) => {
    setBusy(true);
    setError(null);
    const answer = await call().catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      onOk();
    } else if (answer?.code === 'email-unconfirmed') {
      setLength(Number(answer.codeLength) || 0);
      setForm(EMPTY);
      setMode('code');
    } else {
      setError(errorText(t, answer?.code));
    }
  };
  const has = Boolean(sec.state.data?.password?.has);
  const save = () => {
    const problem = passwordProblem(form, mode === 'change');
    if (problem) {
      return setError(errorText(t, problem));
    }
    const { current, password, hint, email } = form;
    const body = { password, hint, email };
    if (mode === 'change') {
      body.current = current;
    }
    return run(
      () => api.telegramPasswordSet(body),
      () => finish('chat.security.saved')
    );
  };
  const drop = () => {
    if (!form.current) {
      return setError(errorText(t, 'need-current'));
    }
    return run(
      () => api.telegramPasswordRemove({ current: form.current }),
      () => finish('chat.security.removed')
    );
  };
  const side = (call, message) => () => run(call, () => finish(message));
  return {
    ...{ mode, form, busy, note, length, pending, has },
    open: (next) => {
      setError(null);
      setNote(null);
      setForm(EMPTY);
      setMode(next);
    },
    set: setForm,
    save: mode === 'remove' ? drop : save,
    confirm: () =>
      run(
        () => api.telegramPasswordEmailConfirm({ code: form.code }),
        () => finish('chat.security.saved')
      ),
    resend: () =>
      run(
        () => api.telegramPasswordEmailResend(),
        () => setNote(t('chat.security.codeSent'))
      ),
    cancel: side(
      () => api.telegramPasswordEmailCancel(),
      'chat.security.cancelled'
    ),
  };
};

const Status = ({ t, password, note }) =>
  el('div', { className: 'security-status', 'data-two-step': password.has }, [
    el(
      'strong',
      { key: 's' },
      password.has ? t('chat.security.on') : t('chat.security.off')
    ),
    password.has && password.hint
      ? el(
          'span',
          { key: 'h', className: 'meta', 'data-hint': true },
          t('chat.security.hint', { hint: password.hint })
        )
      : null,
    el(
      'span',
      { key: 'r', className: 'meta', 'data-recovery': password.hasRecovery },
      password.hasRecovery
        ? t('chat.security.recoveryOn')
        : t('chat.security.recoveryOff')
    ),
    password.emailPending
      ? el(
          'span',
          { key: 'p', className: 'meta', 'data-email-pending': true },
          t('chat.security.emailPending', { email: password.emailPattern })
        )
      : null,
    note
      ? el(
          'span',
          { key: 'n', className: 'meta', 'data-security-note': true },
          note
        )
      : null,
  ]);

const OpenButtons = ({ t, ts }) =>
  el('div', { className: 'security-buttons' }, [
    ts.has
      ? [
          el(
            Button,
            {
              key: 'c',
              name: 'password-open-change',
              onClick: () => ts.open('change'),
            },
            t('chat.security.change')
          ),
          el(
            Button,
            {
              key: 'd',
              name: 'password-open-remove',
              className: 'danger',
              onClick: () => ts.open('remove'),
            },
            t('chat.security.remove')
          ),
        ]
      : el(
          Button,
          {
            key: 's',
            name: 'password-open-set',
            onClick: () => ts.open('set'),
          },
          t('chat.security.set')
        ),
    ts.pending
      ? el(
          Button,
          {
            key: 'e',
            name: 'password-open-code',
            onClick: () => ts.open('code'),
          },
          t('chat.security.enterCode')
        )
      : null,
  ]);

/** Two-step verification: the state and the set / change / remove forms. */
export const TwoStep = (props) => {
  const t = useT();
  const { sec } = props;
  const ts = useTwoStep({ ...props, t });
  if (sec.state.phase !== 'ready' || !sec.state.data.password) {
    return el(Wait, { t, sec });
  }
  const { password } = sec.state.data;
  return el('div', { className: 'security-two-step' }, [
    el(Status, { key: 's', t, password, note: ts.note }),
    el('p', { key: 'h', className: 'meta' }, t('chat.security.twoStepHint')),
    ts.mode === null ? el(OpenButtons, { key: 'o', t, ts }) : null,
    ts.mode === 'code'
      ? el(CodeForm, { key: 'c', t, ...ts, length: ts.length })
      : null,
    ts.mode && ts.mode !== 'code'
      ? el('div', { key: 'f', className: 'security-form' }, [
          el(FormFields, { key: 'fs', t, ...ts, go: ts.save }),
          el('div', { key: 'b', className: 'security-buttons' }, [
            el(
              Button,
              {
                key: 'v',
                name: 'password-save',
                className: ts.mode === 'remove' ? 'danger' : undefined,
                disabled: ts.busy,
                onClick: ts.save,
              },
              ts.mode === 'remove'
                ? t('chat.security.remove')
                : t('chat.security.save')
            ),
            el(
              Button,
              {
                key: 'x',
                name: 'password-cancel',
                onClick: () => ts.open(null),
              },
              t('chat.privacy.confirmNo')
            ),
          ]),
        ])
      : null,
  ]);
};

// A choice from a list with a Save that appears once it differs from what
// Telegram holds; nothing is sent before the click.
const SavedSelect = ({ t, name, value, options, label, save }) => {
  const [draft, setDraft] = useState(String(value));
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(String(value)), [value]);
  return el('div', { className: 'security-choice' }, [
    el('label', { key: 'l', className: 'privacy-label' }, [
      el('span', { key: 't' }, label),
      el(
        'select',
        {
          key: 's',
          'data-field': name,
          value: draft,
          disabled: busy,
          onChange: (e) => setDraft(e.target.value),
        },
        options.map(([key, text]) => el('option', { key, value: key }, text))
      ),
    ]),
    draft === String(value)
      ? null
      : el(
          Button,
          {
            key: 'b',
            name: `${name}-save`,
            disabled: busy,
            onClick: async () => {
              setBusy(true);
              await save(Number(draft));
              setBusy(false);
            },
          },
          t('chat.security.save')
        ),
  ]);
};

const monthsWords = (t, months) =>
  months === 24
    ? t('chat.security.years', { count: 2 })
    : t('chat.security.months', { count: months });

/** Account self-destruct: "If away for" 1 / 3 / 6 / 12 months. */
export const AccountTtl = ({ api, t, setError, sec }) => {
  if (sec.state.phase !== 'ready' || sec.state.data.accountTtlDays === null) {
    return el(Wait, { t, sec });
  }
  const days = sec.state.data.accountTtlDays;
  const odd = monthsOfDays(days) === null;
  const options = [
    ...(odd ? [[String(days), t('chat.security.days', { count: days })]] : []),
    ...ACCOUNT_MONTHS.map((m) => [String(daysOfMonths(m)), monthsWords(t, m)]),
  ];
  const save = async (value) => {
    const answer = await api
      .telegramAccountTtlSet({ days: value })
      .catch(() => null);
    if (answer?.ok) {
      setError(null);
      sec.patch({ ...sec.state.data, accountTtlDays: value });
    } else {
      setError(errorText(t, answer?.code));
    }
  };
  return el('div', { className: 'security-ttl' }, [
    el(SavedSelect, {
      key: 's',
      t,
      name: 'account-ttl',
      value: days,
      options,
      label: t('chat.security.ifAway'),
      save,
    }),
    el('p', { key: 'h', className: 'meta' }, t('chat.security.ifAwayHint')),
  ]);
};

/** Sensitive content: "Disable filtering", only when Telegram allows it. */
export const SensitiveContent = ({ api, t, setError, sec }) => {
  const content = sec.state.data?.content;
  const [draft, setDraft] = useState(Boolean(content?.enabled));
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(Boolean(content?.enabled)), [content?.enabled]);
  if (!content?.canChange) {
    return null;
  }
  const save = async () => {
    setBusy(true);
    const answer = await api
      .telegramSensitiveSet({ enabled: draft })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setError(null);
      sec.patch({ ...sec.state.data, content: { ...content, enabled: draft } });
    } else {
      setError(errorText(t, answer?.code));
    }
  };
  return el('div', { className: 'security-sensitive' }, [
    el('label', { key: 'l', className: 'privacy-switch' }, [
      el('input', {
        key: 'i',
        type: 'checkbox',
        role: 'switch',
        'data-field': 'sensitive',
        checked: draft,
        disabled: busy,
        onChange: (e) => setDraft(e.target.checked),
      }),
      el('span', { key: 's' }, t('chat.security.sensitive')),
      el(
        'span',
        { key: 'h', className: 'meta' },
        t('chat.security.sensitiveHint')
      ),
    ]),
    draft === content.enabled
      ? null
      : el(
          Button,
          { key: 'b', name: 'sensitive-save', disabled: busy, onClick: save },
          t('chat.security.save')
        ),
  ]);
};

/**
 * One session's "Accept secret chats" / "Accept calls" switches; Save
 * shows once either differs from what Telegram holds.
 */
export const SessionSwitches = ({ api, s, setError }) => {
  const t = useT();
  const [saved, setSaved] = useState({
    secretChats: s.secretChats,
    calls: s.calls,
  });
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const dirty =
    draft.secretChats !== saved.secretChats || draft.calls !== saved.calls;
  const save = async () => {
    setBusy(true);
    const answer = await api
      .telegramSessionSettings({ hash: s.hash, ...draft })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setError(null);
      setSaved(draft);
    } else {
      setError(errorText(t, answer?.code));
    }
  };
  const box = (name, label) =>
    el('label', { key: name, className: 'privacy-switch' }, [
      el('input', {
        key: 'i',
        type: 'checkbox',
        role: 'switch',
        'data-field': `session-${name}`,
        checked: draft[name],
        disabled: busy,
        onChange: (e) => setDraft({ ...draft, [name]: e.target.checked }),
      }),
      el('span', { key: 's' }, label),
    ]);
  return el('div', { className: 'security-session-switches' }, [
    box('secretChats', t('chat.security.acceptSecret')),
    box('calls', t('chat.security.acceptCalls')),
    dirty
      ? el(
          Button,
          {
            key: 'b',
            name: 'session-settings-save',
            disabled: busy,
            onClick: save,
          },
          t('chat.security.save')
        )
      : null,
  ]);
};

/** "Terminate old sessions after" an inactivity period. */
export const SessionTtl = ({ api, t, days, setError, onSaved }) => {
  const odd = !SESSION_DAYS.includes(days);
  const options = [
    ...(odd ? [[String(days), t('chat.security.days', { count: days })]] : []),
    ...SESSION_DAYS.map((d) => [
      String(d),
      t('chat.security.days', { count: d }),
    ]),
  ];
  const save = async (value) => {
    const answer = await api
      .telegramSessionTtlSet({ days: value })
      .catch(() => null);
    if (answer?.ok) {
      setError(null);
      onSaved(value);
    } else {
      setError(errorText(t, answer?.code));
    }
  };
  return el(SavedSelect, {
    t,
    name: 'session-ttl',
    value: days,
    options,
    label: t('chat.security.terminateAfter'),
    save,
  });
};
