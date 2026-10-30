// Export chat history, as Telegram Desktop has it in a chat's menu (R-Y186;
// learned, never copied): a "⋯" button in a Telegram chat's header with
// "Export chat history", and a dialog — what to include (photos, videos,
// voice messages, round video messages, stickers, GIFs, files), a size
// limit for videos and files, a date range, HTML and/or JSON, and the
// folder (Desktop's default, or one typed as a full path). The server
// does the export in the background; the dialog follows its progress
// (the events stream's `export:` links, polled slowly as a fallback),
// can cancel it (what was saved stays) and, at the end, shows the folder.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { useEsc } from './chat-invite.js';
import { Icon } from './icons.js';
import { TranslationSwitch } from './chat-translation-switch.js';
import { ProgressBar, countPercent } from './progress-bar.js';

const el = React.createElement;

export const MEDIA_KINDS = [
  'photos',
  'videos',
  'voice',
  'roundVideo',
  'stickers',
  'gifs',
  'files',
];

export const DEFAULT_FORM = Object.freeze({
  media: Object.freeze({
    photos: true,
    videos: true,
    voice: true,
    roundVideo: true,
    stickers: false,
    gifs: false,
    files: true,
  }),
  sizeLimitMb: 8,
  from: '',
  to: '',
  format: 'html',
  folder: '',
});

const FORMATS = { html: ['html'], json: ['json'], both: ['html', 'json'] };

/** The request the server takes, from the dialog's fields. */
export const requestOf = (chat, form) => ({
  chat: String(chat.chat),
  chatName: String(chat.name ?? '').slice(0, 256),
  media: { ...form.media },
  sizeLimitMb: Math.round(Number(form.sizeLimitMb)),
  from: form.from || null,
  to: form.to || null,
  formats: FORMATS[form.format] ?? FORMATS.html,
  folder: form.folder.trim(),
});

/** Whether the fields can be sent (the server checks all of it again). */
export const formReady = (form) => {
  const limit = Number(form.sizeLimitMb);
  return (
    form.folder.trim() !== '' &&
    Number.isInteger(limit) &&
    limit >= 1 &&
    limit <= 4000 &&
    (!form.from || !form.to || form.from <= form.to)
  );
};

/** `12.3 MB`, `640 KB`, `20 B`. */
export const sizeText = (bytes) => {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) {
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }
  return n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;
};

/** 0..100 when the total is known, else null. */
export const percentOf = (job) => countPercent(job?.messages, job?.total);

export const isRunning = (job) =>
  job?.state === 'running' || job?.state === 'cancelling';

// ---- what the page knows of each chat's export ----------------------

const jobs = new Map();
const listeners = new Set();

const keep = (job) => {
  jobs.set(String(job.chat), job);
  for (const listener of listeners) {
    listener();
  }
};

const forget = (chat) => {
  jobs.delete(String(chat));
  for (const listener of listeners) {
    listener();
  }
};

/** The `export:` links among `links`, taken into memory. */
export const feedExports = (links) => {
  for (const link of Array.isArray(links) ? links : []) {
    if (link?.kind === 'export' && link.chat) {
      keep(link);
    }
  }
};

export const useExportFeed = (links) => {
  useEffect(() => {
    feedExports(links);
  }, [links]);
};

const useJob = (chat) => {
  const [, bump] = useState(0);
  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  return jobs.get(String(chat)) ?? null;
};

/** For tests: the memory emptied. */
export const resetExports = () => {
  jobs.clear();
};

// ---- the dialog -------------------------------------------------------

const errorText = (t, code) => {
  const key = `chat.export.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.export.err.failed') : text;
};

const Field = ({ label, children, name }) =>
  el('label', { className: 'export-field', 'data-field-row': name }, [
    el('span', { key: 'l' }, label),
    children,
  ]);

const MediaChecks = ({ form, set, t }) =>
  el('fieldset', { className: 'export-media' }, [
    el('legend', { key: 'lg' }, t('chat.export.include')),
    ...MEDIA_KINDS.map((kind) =>
      el('label', { key: kind, className: 'pin-dialog-option' }, [
        el('input', {
          key: 'c',
          type: 'checkbox',
          'data-option': kind,
          checked: form.media[kind],
          onChange: (e) =>
            set({ media: { ...form.media, [kind]: e.target.checked } }),
        }),
        el('span', { key: 't' }, t(`chat.export.kind.${kind}`)),
      ])
    ),
  ]);

const Form = ({ form, set, t, busyOther }) =>
  el('div', { className: 'export-form' }, [
    el(MediaChecks, { key: 'm', form, set, t }),
    el(Field, { key: 'limit', name: 'limit', label: t('chat.export.limit') }, [
      el('input', {
        key: 'i',
        type: 'number',
        min: 1,
        max: 4000,
        step: 1,
        'data-field': 'limit',
        value: form.sizeLimitMb,
        onChange: (e) => set({ sizeLimitMb: e.target.value }),
      }),
      el('span', { key: 'u', className: 'meta' }, ' MB'),
    ]),
    el('div', { key: 'range', className: 'export-range' }, [
      el(Field, { key: 'f', name: 'from', label: t('chat.export.from') }, [
        el('input', {
          key: 'i',
          type: 'date',
          'data-field': 'from',
          value: form.from,
          onChange: (e) => set({ from: e.target.value }),
        }),
      ]),
      el(Field, { key: 't', name: 'to', label: t('chat.export.to') }, [
        el('input', {
          key: 'i',
          type: 'date',
          'data-field': 'to',
          value: form.to,
          onChange: (e) => set({ to: e.target.value }),
        }),
      ]),
    ]),
    el(
      Field,
      { key: 'format', name: 'format', label: t('chat.export.format') },
      [
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
      ]
    ),
    el(
      Field,
      { key: 'folder', name: 'folder', label: t('chat.export.folder') },
      [
        el('input', {
          key: 'i',
          type: 'text',
          spellCheck: false,
          'data-field': 'folder',
          value: form.folder,
          onChange: (e) => set({ folder: e.target.value }),
        }),
      ]
    ),
    el('p', { key: 'n', className: 'meta' }, t('chat.export.note')),
    busyOther
      ? el('p', { key: 'b', role: 'status' }, t('chat.export.err.busy'))
      : null,
  ]);

const Progress = ({ job, t }) => {
  const percent = percentOf(job);
  return el('div', { className: 'export-progress', 'data-state': job.state }, [
    el(
      'p',
      { key: 's', 'data-export': 'state' },
      t(`chat.export.state.${job.state}`)
    ),
    el(ProgressBar, {
      key: 'bar',
      className: 'export-bar',
      fillClassName: 'export-bar-fill',
      percent: job.state === 'done' ? 100 : percent,
      label: t(`chat.export.state.${job.state}`),
    }),
    el(
      'p',
      { key: 'm', 'data-export': 'messages' },
      job.total
        ? t('chat.export.messagesOf', { done: job.messages, total: job.total })
        : t('chat.export.messages', { done: job.messages })
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
    isRunning(job) && job.current
      ? el(
          'p',
          { key: 'c', className: 'meta', 'data-export': 'current' },
          t('chat.export.current', { name: job.current })
        )
      : null,
    job.code
      ? el('p', { key: 'e', role: 'alert' }, errorText(t, job.code))
      : null,
    !isRunning(job)
      ? el(
          'p',
          { key: 'w', className: 'meta', 'data-export': 'folder' },
          t('chat.export.where', { folder: job.folder })
        )
      : null,
  ]);
};

const useDialogJob = (api, chat, setForm) => {
  const [asked, setAsked] = useState(false);
  const job = useJob(chat.chat);
  const [other, setOther] = useState(false);
  useEffect(() => {
    let current = true;
    Promise.all([api.telegramExportDefaults(), api.telegramExportStatus()])
      .then(([defaults, status]) => {
        if (!current) {
          return;
        }
        if (defaults?.ok) {
          setForm((f) => (f.folder ? f : { ...f, folder: defaults.folder }));
        }
        const live = status?.job;
        if (!live) {
          forget(chat.chat);
        } else if (String(live.chat) === String(chat.chat)) {
          keep({ ...live, kind: 'export', at: new Date().toISOString() });
        }
        setOther(
          Boolean(live) &&
            isRunning(live) &&
            String(live.chat) !== String(chat.chat)
        );
        setAsked(true);
      })
      .catch(() => current && setAsked(true));
    return () => {
      current = false;
    };
  }, [api, chat.chat]);
  // The events stream carries the progress; this only catches up.
  useEffect(() => {
    if (!isRunning(job)) {
      return undefined;
    }
    const timer = globalThis.setInterval(() => {
      api
        .telegramExportStatus()
        .then((s) => {
          if (s?.job && String(s.job.chat) === String(chat.chat)) {
            keep({ ...s.job, kind: 'export', at: new Date().toISOString() });
          }
        })
        .catch(() => {});
    }, 2000);
    return () => globalThis.clearInterval(timer);
  }, [api, chat.chat, job?.state]);
  return { job, other, asked };
};

export const ExportDialog = ({ api, chat, onClose }) => {
  const t = useT();
  useEsc(onClose);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const { job, other, asked } = useDialogJob(api, chat, setForm);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const showing = job && (started || isRunning(job));
  const start = async () => {
    setError(null);
    setStarting(true);
    const answer = await api
      .telegramExportStart(requestOf(chat, form))
      .catch(() => null);
    setStarting(false);
    if (answer?.ok) {
      setStarted(true);
      keep({ ...answer.job, kind: 'export', at: new Date().toISOString() });
    } else {
      setError(answer?.code ?? 'failed');
    }
  };
  const cancel = () => api.telegramExportCancel().catch(() => null);
  const reveal = () => api.telegramExportReveal().catch(() => null);
  return createPortal(
    el(
      'div',
      {
        className: 'delete-dialog-overlay',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('chat.export.title'),
        'data-dialog': 'export',
      },
      el('div', { className: 'delete-dialog export-dialog' }, [
        el('h3', { key: 'h' }, t('chat.export.title')),
        showing
          ? el(Progress, { key: 'p', job, t })
          : el(Form, { key: 'f', form, set, t, busyOther: other }),
        !showing && error
          ? el('p', { key: 'e', role: 'alert' }, errorText(t, error))
          : null,
        el('div', { key: 'b', className: 'delete-dialog-btns' }, [
          showing && isRunning(job)
            ? el(
                'button',
                {
                  key: 'x',
                  type: 'button',
                  'data-action': 'export-cancel',
                  disabled: job.state === 'cancelling',
                  onClick: cancel,
                },
                t('chat.export.cancelJob')
              )
            : null,
          showing && !isRunning(job)
            ? el(
                'button',
                {
                  key: 's',
                  type: 'button',
                  'data-action': 'export-reveal',
                  onClick: reveal,
                },
                t('chat.export.show')
              )
            : null,
          el(
            'button',
            {
              key: 'c',
              type: 'button',
              'data-action': 'export-close',
              onClick: onClose,
            },
            showing ? t('chat.export.close') : t('chat.invite.cancel')
          ),
          !showing
            ? el(
                'button',
                {
                  key: 'go',
                  type: 'button',
                  className: 'primary',
                  'data-action': 'export-start',
                  disabled: !asked || starting || other || !formReady(form),
                  onClick: start,
                },
                t('chat.export.start')
              )
            : null,
        ]),
      ])
    ),
    globalThis.document.body
  );
};

/** Whether a chat can be exported from here: a Telegram chat. */
export const canExport = (chat, api) =>
  chat?.source === 'telegram' &&
  /^-?\d+$/.test(String(chat.chat)) &&
  typeof api?.telegramExportStart === 'function';

/** The header's "⋯" button and its menu with "Export chat history". */
export const ExportMenu = ({ api, chat, info }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(false);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, [open]);
  if (!canExport(chat, api)) {
    return null;
  }
  return el('div', { className: 'chat-menu chat-more' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'chat-more-toggle icon-btn',
        'data-action': 'chat-more',
        'aria-haspopup': 'menu',
        'aria-expanded': open ? 'true' : 'false',
        'aria-label': t('chat.export.menu'),
        title: t('chat.export.menu'),
        onClick: () => setOpen(!open),
      },
      el(Icon, { name: 'dots' })
    ),
    open
      ? el('div', { key: 'l', className: 'chat-menu-list', role: 'menu' }, [
          el(
            'button',
            {
              key: 'x',
              type: 'button',
              role: 'menuitem',
              className: 'chat-more-item',
              'data-action': 'export-open',
              onClick: () => {
                setOpen(false);
                setDialog(true);
              },
            },
            t('chat.export.open')
          ),
          // "Do not translate this chat" (R-Y209).
          el(TranslationSwitch, {
            key: 'tr',
            api,
            chat,
            info,
            done: () => setOpen(false),
          }),
        ])
      : null,
    dialog
      ? el(ExportDialog, {
          key: 'd',
          api,
          chat,
          onClose: () => setDialog(false),
        })
      : null,
  ]);
};
