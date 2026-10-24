// The login email and passkeys of Settings → Privacy and Security (R-Y218;
// learned, never copied). The login email shows as Telegram masks it, with
// "Change login email": a new address, then the code mailed to it. Passkeys
// list name, created and last used, each with Delete behind a confirmation;
// "Add passkey" asks Telegram for WebAuthn options, makes the passkey with
// the browser (navigator.credentials.create) and hands the attestation
// back. A code is cleared from the state as it is sent and never stored.

import React, { useCallback, useEffect, useState } from 'react';
import { useLocaleContext, useT } from './i18n.js';
import { Field, FormDialog } from './chat-create.js';
import { Ask, Over, ResetNotice, dateText } from './chat-security-forgot.js';
import {
  attestationPayload,
  creationOptions,
  passkeyErrorKey,
  passkeysSupported,
} from './passkey-codec.js';

const el = React.createElement;

const Button = ({ name, children, ...props }) =>
  el('button', { type: 'button', 'data-action': name, ...props }, children);

// ---- the login email --------------------------------------------------------

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

const useLoginEmail = ({ api, t, fail, sec, setNote }) => {
  const [step, setStep] = useState(null);
  const [state, setState] = useState({ busy: false, error: null });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const close = () => {
    setStep(null);
    setEmail('');
    setCode('');
    setState({ busy: false, error: null });
  };
  const run = async (call, onOk) => {
    setState({ busy: true, error: null });
    const answer = await call().catch(() => null);
    if (answer?.ok) {
      setState({ busy: false, error: null });
      onOk();
    } else {
      setState({ busy: false, error: fail(t, answer?.code) });
    }
  };
  const submit = () =>
    step === 'email'
      ? run(
          () => api.telegramLoginEmailSend({ email: email.trim() }),
          () => setStep('code')
        )
      : run(
          () => api.telegramLoginEmailVerify({ code }),
          () => {
            close();
            setNote(t('chat.loginEmail.changed'));
            sec.reload();
          }
        );
  return {
    ...{ step, state, email, code, close, submit },
    open: () => setStep('email'),
    setEmail,
    setCode,
    ready:
      step === 'email'
        ? EMAIL.test(email.trim())
        : /^[0-9A-Za-z]{1,16}$/.test(code),
  };
};

const LoginEmailDialog = ({ t, f }) => {
  const asking = f.step === 'email';
  return Over(
    el(
      FormDialog,
      {
        name: 'login-email',
        title: t('chat.loginEmail.change'),
        onClose: f.close,
        onSubmit: () => f.ready && f.submit(),
        submit: asking
          ? t('chat.reset.sendCode')
          : t('chat.security.codeConfirm'),
        busy: f.state.busy || !f.ready,
        error: f.state.error,
        outside: true,
      },
      asking
        ? el(Field, {
            label: t('chat.loginEmail.new'),
            name: 'login-email',
            type: 'email',
            value: f.email,
            autoComplete: 'email',
            autoFocus: true,
            onChange: (e) => f.setEmail(e.target.value),
          })
        : [
            el('p', { key: 'h' }, t('chat.loginEmail.codeSent')),
            el(Field, {
              key: 'c',
              label: t('chat.security.field.code'),
              name: 'login-email-code',
              value: f.code,
              maxLength: 16,
              autoComplete: 'one-time-code',
              autoFocus: true,
              onChange: (e) => f.setCode(e.target.value.trim()),
            }),
          ]
    )
  );
};

/** The login email as Telegram masks it, and "Change login email". */
export const LoginEmail = (props) => {
  const t = useT();
  const [note, setNote] = useState(null);
  const f = useLoginEmail({ ...props, t, setNote });
  const pattern = props.sec.state.data?.password?.loginEmail;
  if (!pattern) {
    return null;
  }
  return el('div', { className: 'security-login-email' }, [
    el(
      'span',
      { key: 'p', className: 'meta', 'data-login-email': pattern },
      t('chat.loginEmail.is', { email: pattern })
    ),
    el(
      Button,
      { key: 'b', name: 'login-email-change', onClick: f.open },
      t('chat.loginEmail.change')
    ),
    note
      ? el(
          'span',
          { key: 'n', className: 'meta', 'data-login-note': true },
          note
        )
      : null,
    f.step ? el(LoginEmailDialog, { key: 'd', t, f }) : null,
  ]);
};

// ---- passkeys ---------------------------------------------------------------

const usePasskeys = (api) => {
  const [state, setState] = useState({ phase: 'loading', items: [] });
  const load = useCallback(() => {
    api
      .telegramPasskeys()
      .then((a) =>
        setState(
          a?.ok
            ? { phase: 'ready', items: a.passkeys ?? [] }
            : { phase: 'error', items: [], code: a?.code }
        )
      )
      .catch(() => setState({ phase: 'error', items: [] }));
  }, [api]);
  useEffect(() => load(), [load]);
  return { state, reload: load };
};

// Makes a passkey: Telegram's options, the browser's credential, the
// attestation back. Resolves an error text or null.
const addPasskey = async ({ api, t, fail }) => {
  const asked = await api.telegramPasskeyOptions().catch(() => null);
  const options = asked?.ok ? creationOptions(asked.options) : null;
  if (!options) {
    return fail(t, asked?.code);
  }
  let credential;
  try {
    credential = await globalThis.navigator.credentials.create(options);
  } catch (error) {
    return t(passkeyErrorKey(error));
  }
  const payload = attestationPayload(credential);
  if (!payload) {
    return t('chat.passkeys.err.cancelled');
  }
  const done = await api.telegramPasskeyRegister(payload).catch(() => null);
  return done?.ok ? null : fail(t, done?.code);
};

const PasskeyRow = ({ t, locale, passkey, onDelete }) =>
  el('div', { className: 'security-passkey', 'data-passkey': passkey.id }, [
    el('strong', { key: 'n' }, passkey.name || t('chat.passkeys.unnamed')),
    el(
      'span',
      { key: 'c', className: 'meta' },
      t('chat.passkeys.created', { date: dateText(passkey.created, locale) })
    ),
    el(
      'span',
      { key: 'u', className: 'meta' },
      passkey.lastUsed
        ? t('chat.passkeys.lastUsed', {
            date: dateText(passkey.lastUsed, locale),
          })
        : t('chat.passkeys.neverUsed')
    ),
    el(
      Button,
      {
        key: 'd',
        name: 'passkey-delete',
        className: 'danger',
        onClick: () => onDelete(passkey),
      },
      t('chat.passkeys.delete')
    ),
  ]);

/** The passkeys list, "Add passkey" and Delete behind a confirmation. */
export const Passkeys = ({ api, fail }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const list = usePasskeys(api);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const add = async () => {
    setBusy(true);
    setError(null);
    setError(await addPasskey({ api, t, fail }));
    setBusy(false);
    list.reload();
  };
  const remove = async () => {
    setBusy(true);
    const answer = await api
      .telegramPasskeyDelete({ id: deleting.id })
      .catch(() => null);
    setBusy(false);
    setError(answer?.ok ? null : fail(t, answer?.code));
    setDeleting(null);
    list.reload();
  };
  const { phase, items } = list.state;
  return el('div', { className: 'security-passkeys' }, [
    phase === 'error'
      ? el(
          'p',
          { key: 'e', className: 'chat-form-error' },
          fail(t, list.state.code)
        )
      : null,
    phase === 'ready' && items.length === 0
      ? el('p', { key: 'z', className: 'meta' }, t('chat.passkeys.none'))
      : null,
    ...items.map((passkey) =>
      el(PasskeyRow, {
        key: passkey.id,
        ...{ t, locale, passkey },
        onDelete: setDeleting,
      })
    ),
    passkeysSupported()
      ? el(
          Button,
          { key: 'a', name: 'passkey-add', disabled: busy, onClick: add },
          t('chat.passkeys.add')
        )
      : el(
          'p',
          { key: 'u', className: 'meta' },
          t('chat.passkeys.unsupported')
        ),
    error ? el('p', { key: 'x', className: 'chat-form-error' }, error) : null,
    deleting
      ? el(Ask, {
          key: 'ask',
          name: 'passkey-delete',
          title: t('chat.passkeys.delete'),
          text: t('chat.passkeys.deleteAsk', { name: deleting.name }),
          yes: t('chat.passkeys.delete'),
          onYes: remove,
          onNo: () => setDeleting(null),
          busy,
        })
      : null,
  ]);
};

/** The whole section: a pending reset, the login email and the passkeys. */
export const SecurityExtras = ({ api, sec, fail }) => {
  const t = useT();
  return el('div', { className: 'security-extras' }, [
    el(ResetNotice, { key: 'r', api, t, fail, sec }),
    el(LoginEmail, { key: 'l', api, fail, sec }),
    el('h5', { key: 'h' }, t('chat.passkeys.title')),
    el('p', { key: 'p', className: 'meta' }, t('chat.passkeys.hint')),
    el(Passkeys, { key: 'k', api, fail }),
  ]);
};
