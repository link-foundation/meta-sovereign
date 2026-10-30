// Account-level settings Telegram Desktop has (R-Y212; learned, never
// copied): Change phone number (a warning, the new number, the code Telegram
// sends there), Delete account (an explanation and a button that opens
// Telegram's own page in a new tab; this app never deletes an account), and
// Export Telegram data (account info, contacts and chats chosen by kind, a
// date range, media up to N MB; read through a takeout session and written
// by the server to a folder it chooses; progress with Cancel).

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { useEsc } from './chat-invite.js';
import { Field, FormDialog } from './chat-create.js';
import { sizeText } from './chat-export.js';
import { ProgressBar, countPercent } from './progress-bar.js';

const el = React.createElement;

export const DELETE_URL = 'https://my.telegram.org/delete';
export const KIND_KEYS = [
  'personal',
  'bots',
  'privateGroups',
  'privateChannels',
  'publicChats',
];

// ---- pure helpers ------------------------------------------------------

/** The number typed, spaces and punctuation removed; null if not a number. */
export const cleanPhone = (text) => {
  const digits = String(text ?? '').replace(/[\s\-().]/g, '');
  return /^\+?\d{5,15}$/.test(digits) ? digits : null;
};

/** `{ days, hours, minutes }` of a wait in seconds (at least a minute). */
export const delayParts = (seconds) => {
  const total = Math.max(60, Math.round(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.ceil((total % 3600) / 60);
  return minutes === 60
    ? { days, hours: hours + 1, minutes: 0 }
    : { days, hours, minutes };
};

/** "1 day 2 hours", "45 minutes": the wait in words. */
export const delayText = (t, seconds) => {
  const { days, hours, minutes } = delayParts(seconds);
  const parts = [
    days > 0 ? t('dataExport.time.days', { count: days }) : null,
    hours > 0 ? t('dataExport.time.hours', { count: hours }) : null,
    days === 0 && minutes > 0
      ? t('dataExport.time.minutes', { count: minutes })
      : null,
  ].filter(Boolean);
  return parts.join(' ');
};

export const DEFAULT_DATA_FORM = Object.freeze({
  info: true,
  contacts: true,
  kinds: Object.freeze({
    personal: true,
    bots: false,
    privateGroups: true,
    privateChannels: false,
    publicChats: false,
  }),
  media: false,
  sizeLimitMb: 8,
  from: '',
  to: '',
  format: 'html',
});

const FORMATS = { html: ['html'], json: ['json'], both: ['html', 'json'] };

/** The request the server takes, from the dialog's fields. */
export const dataRequestOf = (form) => ({
  info: form.info,
  contacts: form.contacts,
  kinds: { ...form.kinds },
  media: form.media,
  sizeLimitMb: Math.round(Number(form.sizeLimitMb)),
  from: form.from || null,
  to: form.to || null,
  formats: FORMATS[form.format] ?? FORMATS.html,
});

/** Whether the fields can be sent (the server checks all of it again). */
export const dataFormReady = (form) => {
  const limit = Number(form.sizeLimitMb);
  return (
    (form.info || form.contacts || Object.values(form.kinds).includes(true)) &&
    Number.isInteger(limit) &&
    limit >= 1 &&
    limit <= 4000 &&
    (!form.from || !form.to || form.from <= form.to)
  );
};

/** 0..100 of the chats done, or null while the chat list is unknown. */
export const chatsPercent = (job) =>
  countPercent(job?.chatsDone, job?.chatsTotal);

const running = (job) =>
  job?.state === 'running' || job?.state === 'cancelling';

// ---- change phone number ----------------------------------------------

const phoneError = (t, code) => {
  const key = `chat.phone.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.phone.err.failed') : text;
};

/** Change phone number: a warning, the number, then the code. */
export const ChangePhoneDialog = ({ api, close, onChanged }) => {
  const t = useT();
  const [step, setStep] = useState('warn');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const sendCode = async () => {
    const clean = cleanPhone(phone);
    if (!clean) {
      setError(phoneError(t, 'phone-invalid'));
      return;
    }
    setBusy(true);
    const answer = await api
      .telegramPhoneChangeSend({ phone: clean })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setError(null);
      setHash(answer.phoneCodeHash);
      setStep('code');
    } else {
      setError(phoneError(t, answer?.code));
    }
  };
  const confirm = async () => {
    setBusy(true);
    const answer = await api
      .telegramPhoneChangeConfirm({
        phone: cleanPhone(phone),
        phoneCodeHash: hash,
        code: code.trim(),
      })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      onChanged(answer.phone);
      close();
    } else {
      setError(phoneError(t, answer?.code));
    }
  };
  const onSubmit = {
    warn: () => setStep('phone'),
    phone: sendCode,
    code: confirm,
  }[step];
  return el(
    FormDialog,
    {
      name: 'change-phone',
      title: t('chat.phone.title'),
      onClose: close,
      onSubmit,
      submit: t(`chat.phone.submit.${step}`),
      busy,
      error,
      outside: true,
    },
    [
      step === 'warn'
        ? el(
            'p',
            { key: 'w', 'data-phone': 'warning' },
            t('chat.phone.warning')
          )
        : null,
      step === 'phone'
        ? el(Field, {
            key: 'p',
            label: t('chat.phone.new'),
            name: 'new-phone',
            type: 'tel',
            autoFocus: true,
            placeholder: '+1 555 0100',
            value: phone,
            onChange: (e) => setPhone(e.target.value),
          })
        : null,
      step === 'code'
        ? el(React.Fragment, { key: 'c' }, [
            el(
              'p',
              { key: 'h', className: 'meta' },
              t('chat.phone.sent', { phone })
            ),
            el(Field, {
              key: 'f',
              label: t('chat.phone.code'),
              name: 'phone-code',
              inputMode: 'numeric',
              autoComplete: 'one-time-code',
              autoFocus: true,
              maxLength: 8,
              value: code,
              onChange: (e) => setCode(e.target.value),
            }),
          ])
        : null,
    ]
  );
};

// ---- delete account ----------------------------------------------------

/** Privacy → Delete my account: explains, opens Telegram's page. */
export const DeleteAccountRow = () => {
  const t = useT();
  return el('div', { className: 'delete-account' }, [
    el('p', { key: 'h', className: 'meta' }, t('chat.deleteAccount.hint')),
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'danger',
        'data-action': 'delete-account',
        onClick: () =>
          globalThis.open?.(DELETE_URL, '_blank', 'noopener,noreferrer'),
      },
      t('chat.deleteAccount.open')
    ),
  ]);
};

// ---- export Telegram data ----------------------------------------------

const dataError = (t, answer) => {
  const code = answer?.code ?? 'failed';
  if (code === 'takeout-delay') {
    return t('dataExport.err.takeout-delay', {
      time: delayText(t, answer.seconds),
    });
  }
  const key = `dataExport.err.${code}`;
  const text = t(key);
  return text === key ? t('dataExport.err.failed') : text;
};

const Check = ({ name, label, checked, onChange }) =>
  el('label', { className: 'pin-dialog-option' }, [
    el('input', {
      key: 'c',
      type: 'checkbox',
      'data-option': name,
      checked,
      onChange: (e) => onChange(e.target.checked),
    }),
    el('span', { key: 't' }, label),
  ]);

const DataForm = ({ form, set, t }) =>
  el('div', { className: 'export-form' }, [
    el('fieldset', { key: 'w', className: 'export-media' }, [
      el('legend', { key: 'l' }, t('dataExport.what')),
      el(Check, {
        key: 'info',
        name: 'info',
        label: t('dataExport.info'),
        checked: form.info,
        onChange: (v) => set({ info: v }),
      }),
      el(Check, {
        key: 'contacts',
        name: 'contacts',
        label: t('dataExport.contacts'),
        checked: form.contacts,
        onChange: (v) => set({ contacts: v }),
      }),
    ]),
    el('fieldset', { key: 'k', className: 'export-media' }, [
      el('legend', { key: 'l' }, t('dataExport.chats')),
      ...KIND_KEYS.map((kind) =>
        el(Check, {
          key: kind,
          name: kind,
          label: t(`dataExport.kind.${kind}`),
          checked: form.kinds[kind],
          onChange: (v) => set({ kinds: { ...form.kinds, [kind]: v } }),
        })
      ),
    ]),
    el(Check, {
      key: 'media',
      name: 'media',
      label: t('dataExport.media'),
      checked: form.media,
      onChange: (v) => set({ media: v }),
    }),
    form.media
      ? el('label', { key: 'limit', className: 'export-field' }, [
          el('span', { key: 'l' }, t('chat.export.limit')),
          el('input', {
            key: 'i',
            type: 'number',
            min: 1,
            max: 4000,
            'data-field': 'limit',
            value: form.sizeLimitMb,
            onChange: (e) => set({ sizeLimitMb: e.target.value }),
          }),
        ])
      : null,
    el(
      'div',
      { key: 'range', className: 'export-range' },
      ['from', 'to'].map((key) =>
        el('label', { key, className: 'export-field' }, [
          el('span', { key: 'l' }, t(`chat.export.${key}`)),
          el('input', {
            key: 'i',
            type: 'date',
            'data-field': key,
            value: form[key],
            onChange: (e) => set({ [key]: e.target.value }),
          }),
        ])
      )
    ),
    el('label', { key: 'format', className: 'export-field' }, [
      el('span', { key: 'l' }, t('chat.export.format')),
      el(
        'select',
        {
          key: 's',
          'data-field': 'format',
          value: form.format,
          onChange: (e) => set({ format: e.target.value }),
        },
        Object.keys(FORMATS).map((f) =>
          el('option', { key: f, value: f }, t(`chat.export.format.${f}`))
        )
      ),
    ]),
    el('p', { key: 'n', className: 'meta' }, t('dataExport.note')),
  ]);

const DataProgress = ({ job, t }) => {
  const percent = chatsPercent(job);
  return el('div', { className: 'export-progress', 'data-state': job.state }, [
    el(
      'p',
      { key: 's', 'data-export': 'state' },
      t(`dataExport.state.${job.state}`)
    ),
    el(ProgressBar, {
      key: 'bar',
      className: 'export-bar',
      fillClassName: 'export-bar-fill',
      percent: job.state === 'done' ? 100 : percent,
      label: t(`dataExport.state.${job.state}`),
    }),
    el(
      'p',
      { key: 'p', 'data-export': 'phase' },
      job.phase === 'chats' && job.chatsTotal !== null
        ? t('dataExport.chatsOf', {
            done: job.chatsDone,
            total: job.chatsTotal,
          })
        : t(`dataExport.phase.${job.phase}`)
    ),
    job.chatName && running(job)
      ? el(
          'p',
          { key: 'c', className: 'meta', 'data-export': 'chat' },
          job.chatName
        )
      : null,
    el(
      'p',
      { key: 'm', 'data-export': 'messages' },
      t('chat.export.messages', { done: job.messages })
    ),
    el(
      'p',
      { key: 'f', 'data-export': 'files' },
      t('chat.export.files', {
        files: job.files,
        bytes: sizeText(job.bytes),
        skipped: job.skipped,
      })
    ),
    job.code
      ? el('p', { key: 'e', role: 'alert' }, dataError(t, { code: job.code }))
      : null,
    !running(job)
      ? el(
          'p',
          { key: 'w', className: 'meta', 'data-export': 'folder' },
          t('chat.export.where', { folder: job.folder })
        )
      : null,
  ]);
};

// The server's job: asked at the start and every second while it runs.
const useDataJob = (api) => {
  const [job, setJob] = useState(null);
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    let current = true;
    api
      .telegramDataExportStatus()
      .then((s) => current && setJob(s?.job ?? null))
      .catch(() => {})
      .finally(() => current && setAsked(true));
    return () => {
      current = false;
    };
  }, [api]);
  useEffect(() => {
    if (!running(job)) {
      return undefined;
    }
    const timer = globalThis.setInterval(() => {
      api
        .telegramDataExportStatus()
        .then((s) => s?.job && setJob(s.job))
        .catch(() => {});
    }, 1000);
    return () => globalThis.clearInterval(timer);
  }, [api, job?.state]);
  return { job, setJob, asked };
};

/** The profile card's "Export Telegram data" button. */
export const ExportDataButton = ({ api, onClick }) => {
  const t = useT();
  return typeof api?.telegramDataExportStart === 'function'
    ? el(
        'button',
        {
          type: 'button',
          'data-action': 'open-data-export',
          onClick,
        },
        t('dataExport.open')
      )
    : null;
};

/** Export Telegram data: the form, then the progress with Cancel. */
export const ExportDataDialog = ({ api, close }) => {
  const t = useT();
  useEsc(close);
  const [form, setForm] = useState(DEFAULT_DATA_FORM);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const { job, setJob, asked } = useDataJob(api);
  const showing = job && (started || running(job));
  const start = async () => {
    setError(null);
    setStarting(true);
    const answer = await api
      .telegramDataExportStart(dataRequestOf(form))
      .catch(() => null);
    setStarting(false);
    if (answer?.ok) {
      setStarted(true);
      setJob(answer.job);
    } else {
      setError(dataError(t, answer));
    }
  };
  const button = (key, action, label, props = {}) =>
    el(
      'button',
      { key, type: 'button', 'data-action': action, ...props },
      label
    );
  return createPortal(
    el(
      'div',
      {
        className: 'delete-dialog-overlay',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('dataExport.title'),
        'data-dialog': 'data-export',
      },
      el('div', { className: 'delete-dialog export-dialog' }, [
        el('h3', { key: 'h' }, t('dataExport.title')),
        showing
          ? el(DataProgress, { key: 'p', job, t })
          : el(DataForm, {
              key: 'f',
              form,
              t,
              set: (patch) => setForm((f) => ({ ...f, ...patch })),
            }),
        !showing && error ? el('p', { key: 'e', role: 'alert' }, error) : null,
        el('div', { key: 'b', className: 'delete-dialog-btns' }, [
          showing && running(job)
            ? button('x', 'data-export-cancel', t('chat.export.cancelJob'), {
                disabled: job.state === 'cancelling',
                onClick: () => api.telegramDataExportCancel().catch(() => null),
              })
            : null,
          showing && !running(job)
            ? button('s', 'data-export-reveal', t('chat.export.show'), {
                onClick: () => api.telegramDataExportReveal().catch(() => null),
              })
            : null,
          button(
            'c',
            'data-export-close',
            showing ? t('chat.export.close') : t('chat.invite.cancel'),
            {
              onClick: close,
            }
          ),
          !showing
            ? button('go', 'data-export-start', t('chat.export.start'), {
                className: 'primary',
                disabled: !asked || starting || !dataFormReady(form),
                onClick: start,
              })
            : null,
        ]),
      ])
    ),
    globalThis.document.body
  );
};
