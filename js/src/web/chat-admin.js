// A group's permissions, slow mode and recent actions in the info column,
// as Telegram Desktop's admin screens (R-Y133; learned, never copied).
// "Permissions" (a group's or supergroup's admins) opens toggles for what
// members may do and, in a supergroup, the slow mode; Save sends only what
// changed. "Recent actions" (a supergroup's or channel's admins) lists who
// did what and when, with "Show more". Escape and a click outside close
// them; Telegram's refusals are told in words.

import React, { useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { ForumToggle } from './chat-topic-admin.js';
import { NotSpam } from './chat-moderation.js';

const el = React.createElement;

export const RIGHTS = [
  'sendMessages',
  'sendMedia',
  'embedLinks',
  'inviteUsers',
  'pinMessages',
  'changeInfo',
  'manageTopics',
];
export const SLOW_MODES = [0, 10, 30, 60, 300, 900, 3600];

const isSupergroup = (info) => info?.kind === 'channel' && !info.broadcast;

/** Whether the info column offers Permissions: an admin of a group. */
export const hasPermissions = (chat, info) =>
  chat?.source === 'telegram' &&
  /^-\d+$/.test(String(chat.chat)) &&
  Boolean(info?.canBan) &&
  info.kind !== 'user' &&
  !info.broadcast;

/** Whether it offers Recent actions: an admin of a supergroup or channel. */
export const hasAdminLog = (chat, info) =>
  chat?.source === 'telegram' &&
  /^-100\d+$/.test(String(chat.chat)) &&
  Boolean(info?.canBan || info?.canInvite);

/** Whether it offers the Topics switch: a supergroup's creator (R-Y153). */
export const hasForumToggle = (chat, info) =>
  chat?.source === 'telegram' &&
  /^-100\d+$/.test(String(chat.chat)) &&
  Boolean(info?.canToggleForum);

const errorText = (t, code) => {
  const key = `chat.admin.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.admin.err.failed') : text;
};

const Failed = ({ t, code }) =>
  code
    ? el(
        'p',
        {
          className: 'comments-failed',
          role: 'alert',
          'data-admin-error': code,
        },
        errorText(t, code)
      )
    : null;

const Toggle = ({ right, on, disabled, onChange, t }) =>
  el('label', { className: 'admin-toggle' }, [
    el('input', {
      key: 'i',
      type: 'checkbox',
      'data-right': right,
      checked: on,
      disabled,
      onChange: (e) => onChange(e.target.checked),
    }),
    el('span', { key: 'l' }, t(`chat.admin.right.${right}`)),
  ]);

const SlowMode = ({ value, disabled, onChange, t }) =>
  el('fieldset', { className: 'admin-slow', 'data-slow': '' }, [
    el('legend', { key: 'l' }, t('chat.admin.slow')),
    ...SLOW_MODES.map((seconds) =>
      el('label', { key: seconds, className: 'admin-toggle' }, [
        el('input', {
          key: 'i',
          type: 'radio',
          name: 'slow-mode',
          'data-slow-mode': seconds,
          checked: value === seconds,
          disabled,
          onChange: () => onChange(seconds),
        }),
        el('span', { key: 'l' }, t(`chat.admin.slow.${seconds}`)),
      ])
    ),
    el('p', { key: 'h', className: 'meta' }, t('chat.admin.slowHint')),
  ]);

// What changed between what was read and what is set now.
export const changesOf = (was, now) =>
  Object.fromEntries(
    RIGHTS.filter((k) => was[k] !== now[k]).map((k) => [k, now[k]])
  );

const usePermissions = (api, chat) => {
  const [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    let live = true;
    api
      .telegramChatPermissions({ chat })
      .catch(() => null)
      .then((answer) => {
        if (live) {
          setState(
            answer?.ok
              ? { phase: 'ready', ...answer }
              : { phase: 'error', code: answer?.code ?? 'failed' }
          );
        }
      });
    return () => {
      live = false;
    };
  }, [api, chat]);
  return state;
};

// Saves what changed: the rights, then the slow mode; the first refusal
// is the answer.
const saveChanges = async (api, chat, read, rights, slow, supergroup) => {
  const changed = changesOf(read.rights, rights);
  if (Object.keys(changed).length > 0) {
    const done = await api
      .telegramChatPermissionsSet({ chat, rights: changed })
      .catch(() => null);
    if (!done?.ok) {
      return done?.code ?? 'failed';
    }
  }
  if (supergroup && slow !== read.slowMode) {
    const done = await api
      .telegramSlowMode({ chat, seconds: slow })
      .catch(() => null);
    if (!done?.ok) {
      return done?.code ?? 'failed';
    }
  }
  return null;
};

const PermissionsBody = ({ api, chat, supergroup, read, close }) => {
  const t = useT();
  const [rights, setRights] = useState(read.rights);
  const [slow, setSlow] = useState(read.slowMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const locked = !read.canEdit || busy;
  const dirty =
    Object.keys(changesOf(read.rights, rights)).length > 0 ||
    (supergroup && slow !== read.slowMode);
  const save = async () => {
    setBusy(true);
    const code = await saveChanges(api, chat, read, rights, slow, supergroup);
    setBusy(false);
    if (code) {
      setError(code);
    } else {
      close();
    }
  };
  return el('div', { className: 'admin-body' }, [
    el('p', { key: 'h', className: 'meta' }, t('chat.admin.permissionsHint')),
    ...RIGHTS.filter((r) => supergroup || r !== 'manageTopics').map((right) =>
      el(Toggle, {
        key: right,
        right,
        t,
        on: rights[right],
        disabled: locked,
        onChange: (on) => setRights({ ...rights, [right]: on }),
      })
    ),
    supergroup
      ? el(SlowMode, {
          key: 'slow',
          t,
          value: slow,
          disabled: locked,
          onChange: setSlow,
        })
      : null,
    !read.canEdit
      ? el('p', { key: 'ro', className: 'meta' }, t('chat.admin.readOnly'))
      : null,
    el(Failed, { key: 'e', t, code: error }),
    read.canEdit
      ? el(
          'button',
          {
            key: 's',
            type: 'button',
            className: 'primary',
            'data-action': 'save-permissions',
            disabled: busy || !dirty,
            onClick: save,
          },
          t('chat.admin.save')
        )
      : null,
  ]);
};

const PermissionsDialog = ({ api, chat, info, close }) => {
  const t = useT();
  const read = usePermissions(api, String(chat.chat));
  let body = el('p', { className: 'meta' }, t('chat.admin.loading'));
  if (read.phase === 'error') {
    body = el(Failed, { t, code: read.code });
  } else if (read.phase === 'ready') {
    body = el(PermissionsBody, {
      api,
      chat: String(chat.chat),
      supergroup: isSupergroup(info),
      read,
      close,
    });
  }
  return el(
    Frame,
    { title: t('chat.admin.permissions'), close, name: 'admin-permissions' },
    body
  );
};

const LogRow = ({ event, t, dates, api, chat }) =>
  el('li', { className: 'admin-event', 'data-event': event.kind }, [
    el('strong', { key: 'n', className: 'member-name' }, event.userName),
    el(
      'span',
      { key: 't', className: 'admin-event-text' },
      t(`chat.admin.log.${event.kind}`, {
        text: event.text ?? '',
        count: Number(event.text) || 0,
      })
    ),
    el(
      'span',
      { key: 'w', className: 'meta admin-event-when' },
      dates.dateTime(event.date)
    ),
    // A deleted message may be one anti-spam took by mistake (R-Y200).
    event.kind === 'delete' && event.msgId
      ? el(NotSpam, { key: 's', api, chat, msgId: event.msgId })
      : null,
  ]);

const useLog = (api, chat) => {
  const [state, setState] = useState({ phase: 'loading', events: [] });
  const load = (maxId) =>
    api
      .telegramAdminLog({ chat, ...(maxId ? { maxId } : {}) })
      .catch(() => null)
      .then((answer) =>
        setState((old) =>
          answer?.ok
            ? {
                phase: 'ready',
                events: [...(maxId ? old.events : []), ...answer.events],
                next: answer.next ?? null,
              }
            : { phase: 'error', code: answer?.code ?? 'failed', events: [] }
        )
      );
  useEffect(() => {
    load(null);
  }, [api, chat]);
  return [state, load];
};

const LogBody = ({ state, load, t, api, chat }) => {
  const dates = useDates();
  if (state.phase === 'loading') {
    return el('p', { className: 'meta' }, t('chat.admin.loading'));
  }
  if (state.phase === 'error') {
    return el(Failed, { t, code: state.code });
  }
  if (state.events.length === 0) {
    return el('p', { className: 'meta' }, t('chat.admin.logEmpty'));
  }
  return el('div', null, [
    el(
      'ul',
      { key: 'l', className: 'member-list' },
      state.events.map((event) =>
        el(LogRow, { key: event.id, event, t, dates, api, chat })
      )
    ),
    state.next
      ? el(
          'button',
          {
            key: 'm',
            type: 'button',
            className: 'comments-older',
            'data-action': 'log-more',
            onClick: () => load(state.next),
          },
          t('chat.admin.more')
        )
      : null,
  ]);
};

const LogDialog = ({ api, chat, close }) => {
  const t = useT();
  const [state, load] = useLog(api, String(chat.chat));
  return el(
    Frame,
    { title: t('chat.admin.log'), close, name: 'admin-log' },
    el(LogBody, { state, load, t, api, chat: String(chat.chat) })
  );
};

/** Permissions and Recent actions for the chat's admins, or nothing. */
export const AdminActions = ({ api, chat, info }) => {
  const t = useT();
  const [open, setOpen] = useState(null);
  const perms = hasPermissions(chat, info);
  const log = hasAdminLog(chat, info);
  // A supergroup's creator switches Topics on and off (R-Y153).
  const forum = hasForumToggle(chat, info);
  if (!perms && !log && !forum) {
    return null;
  }
  const close = () => setOpen(null);
  const button = (key, label, action) =>
    el(
      'button',
      {
        key,
        type: 'button',
        className: 'admin-open',
        'data-action': action,
        onClick: () => setOpen(key),
      },
      label
    );
  return el('div', { className: 'admin-actions' }, [
    perms ? button('perms', t('chat.admin.permissions'), 'permissions') : null,
    log ? button('log', t('chat.admin.log'), 'admin-log') : null,
    forum ? el(ForumToggle, { key: 'forum', api, chat, info }) : null,
    open === 'perms'
      ? el(PermissionsDialog, { key: 'pd', api, chat, info, close })
      : null,
    open === 'log' ? el(LogDialog, { key: 'ld', api, chat, close }) : null,
  ]);
};
