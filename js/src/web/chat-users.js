import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { useEsc } from './chat-invite.js';
import { useChatUsers, usersRunning } from './chat-users-state.js';
import {
  UsersNumber,
  UsersCheck,
  UsersCoverage,
  UsersList,
  UsersProgress,
  UsersPlan,
} from './chat-users-content.js';

const el = React.createElement;
const optionsReady = (options, ranges) =>
  Object.entries(ranges).every(
    ([key, max]) =>
      Number.isInteger(options[key]) && options[key] >= 0 && options[key] <= max
  );
const button = (action, label, onClick, disabled = false) =>
  el(
    'button',
    {
      key: action,
      type: 'button',
      'data-action': `users-${action}`,
      onClick,
      disabled,
    },
    label
  );
const ContactForm = ({ model, options, set, t }) =>
  el('fieldset', { disabled: model.busy, className: 'chat-users-options' }, [
    el('legend', { key: 'l' }, t('chat.users.contacts')),
    ...Object.entries({ limit: 100_000, delayMs: 3_600_000 }).map(
      ([name, max]) =>
        el(UsersNumber, {
          key: name,
          name,
          max,
          value: options[name],
          set: (value) => set({ [name]: value }),
          t,
        })
    ),
    ...['includeExisting', 'sharePhone'].map((name) =>
      el(UsersCheck, {
        key: name,
        name,
        checked: options[name],
        set: (value) => set({ [name]: value }),
        t,
      })
    ),
    button(
      'preview',
      t('chat.users.preview'),
      () => model.preview(options),
      !optionsReady(options, { limit: 100_000, delayMs: 3_600_000 })
    ),
    model.plan ? el(UsersPlan, { key: 'p', plan: model.plan, t }) : null,
    model.plan
      ? button(
          'apply',
          t('chat.users.apply', { count: model.plan.selected }),
          () =>
            model.action('telegramChatUsersContactsApply', {
              planId: model.plan.planId,
              confirm: true,
            }),
          model.plan.selected === 0
        )
      : null,
  ]);
const ScanForm = ({ options, set, model, chat, t, running }) =>
  el(
    'fieldset',
    {
      disabled: model.busy || running || !model.data,
      className: 'chat-users-options',
    },
    [
      el('legend', { key: 'l' }, t('chat.users.scan')),
      ...Object.entries({
        participantsLimit: 1_000_000,
        messagesLimit: 10_000_000,
      }).map(([name, max]) =>
        el(UsersNumber, {
          key: name,
          name,
          max,
          value: options[name],
          set: (value) => set({ [name]: value }),
          t,
        })
      ),
      el('p', { key: 'hint', className: 'meta' }, t('chat.users.scanHint')),
      button(
        'start',
        t('chat.users.start'),
        () =>
          model.action('telegramChatUsersStart', {
            chat: String(chat.chat),
            ...options,
          }),
        !optionsReady(options, {
          participantsLimit: 1_000_000,
          messagesLimit: 10_000_000,
        })
      ),
    ]
  );
const UsersActions = ({ own, model, running, job, onClose, t }) =>
  el('div', { key: 'actions', className: 'delete-dialog-btns' }, [
    own && model.data.offset > 0
      ? button(
          'previous',
          t('chat.users.previous'),
          () => model.page(Math.max(0, model.data.offset - 100)),
          model.busy
        )
      : null,
    own && model.data.more
      ? button(
          'next',
          t('chat.users.next'),
          () => model.page(model.data.offset + 100),
          model.busy
        )
      : null,
    own && !running
      ? button('download', t('chat.users.download'), model.download, model.busy)
      : null,
    own && running
      ? button(
          'cancel',
          t('chat.users.cancel'),
          () => model.action('telegramChatUsersCancel'),
          model.busy || job.state === 'cancelling'
        )
      : null,
    button('close', t('chat.export.close'), onClose),
  ]);

export const ChatUsersDialog = ({ api, chat, onClose }) => {
  const t = useT();
  useEsc(onClose);
  const model = useChatUsers(api, chat);
  const [scan, setScan] = useState({
    participantsLimit: 10_000,
    messagesLimit: 100_000,
  });
  const [contacts, setContacts] = useState({
    limit: 20,
    delayMs: 10_000,
    sharePhone: false,
    includeExisting: false,
  });
  const job = model.data?.job;
  const other = job && String(job.chat) !== String(chat.chat);
  const running = usersRunning(job);
  const own = job && !other;
  const set = (patch) => {
    model.clearPlan();
    setContacts((old) => ({ ...old, ...patch }));
  };
  return createPortal(
    el(
      'div',
      {
        className: 'delete-dialog-overlay',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('chat.users.title'),
        'data-dialog': 'chat-users',
      },
      el(
        'div',
        { className: 'delete-dialog export-dialog chat-users-dialog' },
        [
          el('h3', { key: 'h' }, t('chat.users.title')),
          el('p', { key: 'note', className: 'meta' }, t('chat.users.note')),
          el(ScanForm, {
            key: 's',
            options: scan,
            set: (patch) => {
              model.clearPlan();
              setScan((old) => ({ ...old, ...patch }));
            },
            model,
            chat,
            t,
            running,
          }),
          other
            ? el('p', { key: 'other', role: 'status' }, t('chat.users.other'))
            : null,
          own ? el(UsersProgress, { key: 'progress', job, t }) : null,
          own
            ? el(UsersCoverage, { key: 'coverage', coverage: job.coverage, t })
            : null,
          own && job.kind === 'scan' && job.state === 'done'
            ? el(ContactForm, {
                key: 'contacts',
                model,
                options: contacts,
                set,
                t,
              })
            : null,
          own ? el(UsersList, { key: 'list', data: model.data, t }) : null,
          model.error
            ? el(
                'p',
                { key: 'error', role: 'alert' },
                t(`chat.users.error.${model.error}`) ===
                  `chat.users.error.${model.error}`
                  ? t('chat.users.jobFailed')
                  : t(`chat.users.error.${model.error}`)
              )
            : null,
          el(UsersActions, {
            key: 'actions',
            own,
            model,
            running,
            job,
            onClose,
            t,
          }),
        ]
      )
    ),
    document.body
  );
};
