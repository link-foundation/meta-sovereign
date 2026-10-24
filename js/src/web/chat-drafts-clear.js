// "Clear all drafts" in Privacy and Security (R-Y207; learned, never
// copied): the unsent messages Telegram keeps in the cloud, on every
// device, deleted after a confirmation (messages.clearAllDrafts). The
// page's own per-chat drafts follow, as the stored ones are emptied and
// each chat's box takes the empty cloud draft.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { useEsc } from './chat-invite.js';

const el = React.createElement;

const SYNC_MS = 5 * 60 * 1000;

/**
 * The drafts typed on other devices, read when the account is connected
 * and every few minutes after (messages.getAllDrafts); the live updates
 * keep them current in between.
 */
export const useDraftsSync = (api, on) => {
  useEffect(() => {
    if (!on || typeof api?.telegramDraftsSync !== 'function') {
      return undefined;
    }
    const run = () => api.telegramDraftsSync().catch(() => null);
    run();
    const timer = globalThis.setInterval(run, SYNC_MS);
    return () => globalThis.clearInterval(timer);
  }, [on]);
};

/**
 * A confirmation over the Privacy dialog (the synced contacts' too,
 * R-Y217): `words` are { title, text, cancel, yes } and `name` the prefix
 * of its data attributes. Escape closes only it, not the dialog under it.
 */
export const ConfirmPortal = ({ name, words, busy, onYes, onNo }) => {
  useEsc(onNo);
  return createPortal(
    el(
      'div',
      {
        className: 'delete-dialog-overlay',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': words.title,
        [`data-${name}-confirm`]: '',
        onMouseDown: (e) => e.target === e.currentTarget && onNo(),
      },
      el('div', { className: 'delete-dialog' }, [
        el('p', { key: 'p' }, words.text),
        el('div', { key: 'b', className: 'delete-dialog-btns' }, [
          el(
            'button',
            {
              key: 'n',
              type: 'button',
              className: 'btn',
              'data-action': `${name}-cancel`,
              onClick: onNo,
            },
            words.cancel
          ),
          el(
            'button',
            {
              key: 'y',
              type: 'button',
              className: 'btn danger',
              'data-action': `${name}-confirm`,
              disabled: busy,
              onClick: onYes,
            },
            words.yes
          ),
        ]),
      ])
    ),
    document.body
  );
};

/**
 * A setting that deletes something after a confirmation: a hint, a
 * button, the confirmation and the outcome. `name` prefixes its data
 * attributes, `words` are { hint, button, title, text, cancel, yes, done,
 * failed }, `run()` asks the server, `children` follow the hint.
 */
export const ConfirmedClear = ({ name, words, run, children }) => {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const clear = async () => {
    setBusy(true);
    const answer = await run().catch(() => null);
    setBusy(false);
    setAsking(false);
    setNote(answer?.ok ? 'done' : 'failed');
  };
  return el('div', { className: `${name}-clear` }, [
    el('p', { key: 'h', className: 'meta' }, words.hint),
    children,
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'btn danger',
        'data-action': `${name}-clear`,
        onClick: () => {
          setNote(null);
          setAsking(true);
        },
      },
      words.button
    ),
    note
      ? el(
          'p',
          {
            key: 'n',
            className: note === 'done' ? 'meta' : 'error',
            role: 'status',
            [`data-${name}-note`]: note,
          },
          words[note]
        )
      : null,
    asking
      ? el(ConfirmPortal, {
          key: 'c',
          name,
          words: { ...words, title: words.button },
          busy,
          onYes: clear,
          onNo: () => setAsking(false),
        })
      : null,
  ]);
};

/** The setting: a button, its hint, a confirmation, the outcome. */
export const ClearDrafts = ({ api }) => {
  const t = useT();
  if (typeof api?.telegramDraftsClear !== 'function') {
    return null;
  }
  return el(ConfirmedClear, {
    name: 'drafts',
    words: {
      hint: t('chat.drafts.hint'),
      button: t('chat.drafts.clear'),
      text: t('chat.drafts.confirm'),
      cancel: t('chat.drafts.cancel'),
      yes: t('chat.drafts.confirmYes'),
      done: t('chat.drafts.done'),
      failed: t('chat.drafts.failed'),
    },
    run: () => api.telegramDraftsClear(),
  });
};
