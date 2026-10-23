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

// Escape closes only it, not the Privacy dialog under it.
const Confirm = ({ t, busy, onYes, onNo }) => {
  useEsc(onNo);
  return createPortal(
    el(
      'div',
      {
        className: 'delete-dialog-overlay',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('chat.drafts.clear'),
        'data-drafts-confirm': '',
        onMouseDown: (e) => e.target === e.currentTarget && onNo(),
      },
      el('div', { className: 'delete-dialog' }, [
        el('p', { key: 'p' }, t('chat.drafts.confirm')),
        el('div', { key: 'b', className: 'delete-dialog-btns' }, [
          el(
            'button',
            {
              key: 'n',
              type: 'button',
              className: 'btn',
              'data-action': 'drafts-cancel',
              onClick: onNo,
            },
            t('chat.drafts.cancel')
          ),
          el(
            'button',
            {
              key: 'y',
              type: 'button',
              className: 'btn danger',
              'data-action': 'drafts-confirm',
              disabled: busy,
              onClick: onYes,
            },
            t('chat.drafts.confirmYes')
          ),
        ]),
      ])
    ),
    document.body
  );
};

/** The setting: a button, its hint, a confirmation, the outcome. */
export const ClearDrafts = ({ api }) => {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  if (typeof api?.telegramDraftsClear !== 'function') {
    return null;
  }
  const clear = async () => {
    setBusy(true);
    const answer = await api.telegramDraftsClear().catch(() => null);
    setBusy(false);
    setAsking(false);
    setNote(answer?.ok ? 'done' : 'failed');
  };
  return el('div', { className: 'drafts-clear' }, [
    el('p', { key: 'h', className: 'meta' }, t('chat.drafts.hint')),
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'btn danger',
        'data-action': 'drafts-clear',
        onClick: () => {
          setNote(null);
          setAsking(true);
        },
      },
      t('chat.drafts.clear')
    ),
    note
      ? el(
          'p',
          {
            key: 'n',
            className: note === 'done' ? 'meta' : 'error',
            role: 'status',
            'data-drafts-note': note,
          },
          t(`chat.drafts.${note}`)
        )
      : null,
    asking
      ? el(Confirm, {
          key: 'c',
          t,
          busy,
          onYes: clear,
          onNo: () => setAsking(false),
        })
      : null,
  ]);
};
