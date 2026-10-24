// "Forgot password?" beside the 2-step verification password, and a pending
// password reset (R-Y218; learned, never copied). With a recovery email a
// code is mailed to it and, entered, takes the password away; without one
// "Reset password" asks Telegram to remove it after a waiting period, and
// while that is pending "Cancel reset request" calls it off. A code lives
// only in the dialog's state and is cleared as it is sent.

import React, { useState } from 'react';
import { useLocaleContext, useT } from './i18n.js';
import { Field, FormDialog } from './chat-create.js';
import { overPage } from './paid-portal.js';

const el = React.createElement;

// A dialog over the page, apart from the form it was opened from: its
// submit must not reach the privacy dialog's own form.
export const Over = (dialog) =>
  overPage(el('div', { onSubmit: (e) => e.stopPropagation() }, dialog));

/** A yes / no question in a dialog. */
export const Ask = ({ name, title, text, yes, onYes, onNo, busy, error }) =>
  Over(
    el(
      FormDialog,
      {
        name,
        title,
        onClose: onNo,
        onSubmit: onYes,
        submit: yes,
        busy,
        error,
        outside: true,
      },
      el('p', { key: 'p' }, text)
    )
  );

/** A date as the locale writes it. */
export const dateText = (iso, locale) =>
  iso ? new Date(iso).toLocaleString(locale || undefined) : '';

const Button = ({ name, children, ...props }) =>
  el('button', { type: 'button', 'data-action': name, ...props }, children);

// What the dialog says after a reset request, by Telegram's answer.
const resetMessage = (t, answer, locale) =>
  answer.result === 'wait'
    ? t('chat.reset.requested', { date: dateText(answer.until, locale) })
    : t('chat.reset.done');

const useForgot = ({ api, t, fail, locale, sec, onDone }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('start');
  const [state, setState] = useState({ busy: false, error: null });
  const [pattern, setPattern] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const hasRecovery = Boolean(sec.state.data?.password?.hasRecovery);
  const close = () => {
    const finished = step === 'result';
    setOpen(false);
    setStep('start');
    setCode('');
    setState({ busy: false, error: null });
    if (finished) {
      sec.reload();
      onDone?.();
    }
  };
  const run = async (call, onOk) => {
    setState({ busy: true, error: null });
    const answer = await call().catch(() => null);
    if (answer?.ok) {
      setState({ busy: false, error: null });
      onOk(answer);
    } else {
      const wait = answer?.result === 'failed-wait';
      setState({
        busy: false,
        error: wait
          ? t('chat.reset.failedWait', { date: dateText(answer.until, locale) })
          : fail(t, answer?.code),
      });
    }
  };
  const submit = () => {
    if (step === 'result') {
      return close();
    }
    if (step === 'code') {
      return run(
        () => api.telegramRecoveryConfirm({ code }),
        () => {
          setCode('');
          setMessage(t('chat.reset.removed'));
          setStep('result');
        }
      );
    }
    return hasRecovery
      ? run(
          () => api.telegramRecoveryRequest(),
          (a) => {
            setPattern(a.pattern ?? '');
            setStep('code');
          }
        )
      : run(
          () => api.telegramPasswordReset(),
          (a) => {
            setMessage(resetMessage(t, a, locale));
            setStep('result');
          }
        );
  };
  return {
    ...{ open, setOpen, step, state, pattern, code, setCode, message },
    ...{ hasRecovery, close, submit },
  };
};

const forgotBody = (t, f) => {
  if (f.step === 'result') {
    return el('p', { key: 'r', 'data-reset-result': true }, f.message);
  }
  if (f.step === 'code') {
    return [
      el('p', { key: 'h' }, t('chat.reset.codeSent', { email: f.pattern })),
      el(Field, {
        key: 'c',
        label: t('chat.security.field.code'),
        name: 'recovery-code',
        value: f.code,
        maxLength: 16,
        autoComplete: 'one-time-code',
        autoFocus: true,
        onChange: (e) => f.setCode(e.target.value.trim()),
      }),
    ];
  }
  return el(
    'p',
    { key: 'h' },
    f.hasRecovery ? t('chat.reset.viaEmail') : t('chat.reset.viaReset')
  );
};

const forgotSubmit = (t, f) => {
  if (f.step === 'result') {
    return t('chat.privacy.done');
  }
  if (f.step === 'code') {
    return t('chat.security.codeConfirm');
  }
  return f.hasRecovery ? t('chat.reset.sendCode') : t('chat.reset.reset');
};

/** The "Forgot password?" button and its dialog. */
export const ForgotPassword = (props) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const f = useForgot({ ...props, t, locale });
  return el(React.Fragment, null, [
    el(
      Button,
      { key: 'b', name: 'forgot-password', onClick: () => f.setOpen(true) },
      t('chat.reset.forgot')
    ),
    f.open
      ? Over(
          el(
            FormDialog,
            {
              key: 'd',
              name: 'forgot-password',
              title: t('chat.reset.forgot'),
              onClose: f.close,
              onSubmit: f.submit,
              submit: forgotSubmit(t, f),
              busy: f.state.busy || (f.step === 'code' && !f.code),
              error: f.state.error,
              outside: true,
            },
            forgotBody(t, f)
          )
        )
      : null,
  ]);
};

/** A pending reset request: when it ends, and "Cancel reset request". */
export const ResetNotice = ({ api, t, fail, sec }) => {
  const { locale } = useLocaleContext();
  const [asking, setAsking] = useState(false);
  const [state, setState] = useState({ busy: false, error: null });
  const password = sec.state.data?.password;
  if (!password?.resetPending) {
    return null;
  }
  const cancel = async () => {
    setState({ busy: true, error: null });
    const answer = await api.telegramPasswordResetCancel().catch(() => null);
    if (answer?.ok) {
      setAsking(false);
      setState({ busy: false, error: null });
      sec.reload();
    } else {
      setState({ busy: false, error: fail(t, answer?.code) });
    }
  };
  return el(
    'div',
    { className: 'security-reset', 'data-reset-pending': true },
    [
      el(
        'span',
        { key: 't', className: 'meta' },
        t('chat.reset.pending', { date: dateText(password.resetDate, locale) })
      ),
      el(
        Button,
        { key: 'b', name: 'reset-cancel', onClick: () => setAsking(true) },
        t('chat.reset.cancel')
      ),
      asking
        ? el(Ask, {
            key: 'a',
            name: 'reset-cancel',
            title: t('chat.reset.cancel'),
            text: t('chat.reset.cancelAsk'),
            yes: t('chat.reset.cancel'),
            onYes: cancel,
            onNo: () => setAsking(false),
            ...state,
          })
        : null,
    ]
  );
};
