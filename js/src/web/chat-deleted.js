// A chat's deleted messages (R-Z7; R-K1, R-K2, R-K4). The app keeps a
// message the network deleted (or the user deleted here) instead of losing
// it: a bar over the chat says how many are kept and opens the list, where
// each one can be recovered (it shows in the chat again) or erased for good
// (asked first). Both are local: nothing is sent to any network.

import React, { useCallback, useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { useEsc } from './chat-invite.js';

const el = React.createElement;

/** Whether the server can list deleted messages. */
export const hasDeletedApi = (api) =>
  typeof api?.deletedMessages === 'function';

/** When the message was deleted (ISO text), whatever the stored shape. */
export const deletedWhen = (message) =>
  (typeof message?.deleted === 'object' ? message.deleted?.at : null) ??
  message?.deletedAt ??
  null;

/** `{ messages, reload }` of a chat; `reload` after a change or a delete. */
export const useDeleted = (api, key, refreshOn) => {
  const [messages, setMessages] = useState([]);
  const reload = useCallback(async () => {
    const answer =
      key && hasDeletedApi(api) ? await api.deletedMessages(key) : null;
    setMessages(Array.isArray(answer?.messages) ? answer.messages : []);
  }, [api, key]);
  useEffect(() => {
    reload().catch(() => setMessages([]));
  }, [reload, refreshOn]);
  return { messages, reload };
};

const PurgeDialog = ({ t, busy, error, onYes, onNo }) => {
  useEsc(onNo);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.deleted.purgeTitle'),
      'data-dialog': 'deleted-purge',
    },
    el('div', { className: 'delete-dialog' }, [
      el('h3', { key: 'h' }, t('chat.deleted.purgeTitle')),
      el('p', { key: 'p' }, t('chat.deleted.purgeBody')),
      error
        ? el('p', { key: 'e', role: 'alert' }, t('chat.deleted.err'))
        : null,
      el('div', { key: 'b', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'n',
            type: 'button',
            autoFocus: true,
            'data-action': 'cancel',
            onClick: onNo,
          },
          t('chat.deleted.cancel')
        ),
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: 'danger',
            'data-action': 'purge-confirm',
            disabled: busy,
            onClick: onYes,
          },
          t('chat.deleted.purgeYes')
        ),
      ]),
    ])
  );
};

const Row = ({ message, t, dates, onRecover, onPurge, busy }) => {
  const when = deletedWhen(message);
  return el(
    'div',
    { className: 'deleted-row', 'data-deleted-id': message.id },
    [
      el('div', { key: 'm', className: 'deleted-text' }, [
        el('strong', { key: 's' }, message.senderName ?? message.sender ?? ''),
        el(
          'span',
          { key: 'b', className: 'deleted-body' },
          message.body || '📎'
        ),
        el(
          'span',
          { key: 'w', className: 'meta' },
          [
            message.timestamp ? dates.dateTime(message.timestamp) : null,
            when
              ? t('chat.deleted.when', { when: dates.dateTime(when) })
              : null,
          ]
            .filter(Boolean)
            .join(' · ')
        ),
      ]),
      el('div', { key: 'a', className: 'deleted-actions' }, [
        el(
          'button',
          {
            key: 'r',
            type: 'button',
            className: 'button',
            'data-action': 'deleted-recover',
            disabled: busy,
            onClick: () => onRecover(message.id),
          },
          t('chat.deleted.recover')
        ),
        el(
          'button',
          {
            key: 'p',
            type: 'button',
            className: 'button danger',
            'data-action': 'deleted-purge',
            disabled: busy,
            onClick: () => onPurge(message.id),
          },
          t('chat.deleted.purge')
        ),
      ]),
    ]
  );
};

const DeletedList = ({ api, messages, reload, close }) => {
  const t = useT();
  const dates = useDates();
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const run = async (call, ids) => {
    setBusy(true);
    setError(false);
    const answer = await call(ids).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setAsking(null);
      await reload();
    } else {
      setError(true);
    }
  };
  return el(
    Frame,
    { title: t('chat.deleted.title'), close, name: 'deleted-messages' },
    [
      el('p', { key: 'i', className: 'meta' }, t('chat.deleted.local')),
      messages.length === 0
        ? el('p', { key: 'e', className: 'meta' }, t('chat.deleted.empty'))
        : null,
      ...messages.map((message) =>
        el(Row, {
          key: message.id,
          message,
          t,
          dates,
          busy,
          onRecover: (id) => run(api.recoverDeleted, [id]),
          onPurge: (id) => setAsking([id]),
        })
      ),
      messages.length > 1
        ? el(
            'button',
            {
              key: 'all',
              type: 'button',
              className: 'button danger',
              'data-action': 'deleted-purge-all',
              disabled: busy,
              onClick: () => setAsking(messages.map((m) => m.id)),
            },
            t('chat.deleted.purgeAll')
          )
        : null,
      error && !asking
        ? el('p', { key: 'x', role: 'alert' }, t('chat.deleted.err'))
        : null,
      asking
        ? el(PurgeDialog, {
            key: 'q',
            t,
            busy,
            error,
            onNo: () => setAsking(null),
            onYes: () => run(api.purgeDeleted, asking),
          })
        : null,
    ]
  );
};

/** The bar over the chat: how many are kept, and the list behind "View". */
export const DeletedBar = ({ state, api }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const key = state.current?.key ?? null;
  const { messages, reload } = useDeleted(api, key, state.messages?.length);
  useEffect(() => setOpen(false), [key]);
  if (!hasDeletedApi(api) || (messages.length === 0 && !open)) {
    return null;
  }
  return el('div', { className: 'chat-deleted-bar', 'data-bar': 'deleted' }, [
    el('span', { key: 't' }, t('chat.deleted.bar', { count: messages.length })),
    el(
      'button',
      {
        key: 'v',
        type: 'button',
        className: 'button',
        'data-action': 'deleted-open',
        onClick: () => setOpen(true),
      },
      t('chat.deleted.view')
    ),
    open
      ? el(DeletedList, {
          key: 'l',
          api,
          messages,
          reload,
          close: () => setOpen(false),
        })
      : null,
  ]);
};
