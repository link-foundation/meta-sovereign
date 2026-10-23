// A chat's administrators in the edit dialog, as Telegram Desktop has them
// (R-Y204; learned, never copied): the administrators with their custom
// titles and who promoted them; "Add administrator" picks a member and
// opens the Admin rights dialog; a click on an administrator opens it too.
// "Chat history for new members: Visible or Hidden" is a supergroup's
// switch. A basic group needs to become a supergroup for custom rights and
// for a hidden history: the page asks "This will convert the group to a
// supergroup", migrates, and opens the new chat.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { openChat } from './chat-state.js';
import { FormDialog } from './chat-create.js';
import { adminErrorText } from './chat-add-members.js';
import { Aside, MemberPicker, RightsDialog } from './chat-admin-rights.js';
import { kindOfChat } from '../sources/telegram-admin-rights.js';

const el = React.createElement;

/** Whether the edit dialog lists administrators: an admin of the chat. */
export const hasAdminSection = (chat, info) =>
  chat?.source === 'telegram' &&
  /^-\d+$/.test(String(chat.chat)) &&
  Boolean(info) &&
  info.kind !== 'user' &&
  Boolean(info.canAddAdmins || info.canBan || info.canInvite);

/** Whether the history switch is offered: a supergroup's, a group's owner. */
export const hasHistorySwitch = (chat, info) =>
  hasAdminSection(chat, info) &&
  !info.broadcast &&
  (info.kind === 'group' ? Boolean(info.creator) : info.canToggleHistory);

/** The kind of chat the info tells: channel, supergroup or group. */
export const kindOf = (chat, info) =>
  kindOfChat(String(chat.chat), Boolean(info?.broadcast));

/** Whether an administrator row may be opened for editing. */
export const canEditAdmin = (info, kind, admin) =>
  Boolean(info?.canAddAdmins) &&
  admin.role === 'admin' &&
  !admin.self &&
  (kind === 'group' ? Boolean(info.creator) : admin.canEdit);

const useAdmins = (api, chat, tick) => {
  const [state, setState] = useState({ phase: 'loading', admins: [] });
  useEffect(() => {
    let active = true;
    api
      .telegramChatAdmins({ chat })
      .catch(() => null)
      .then((answer) => {
        if (active) {
          setState(
            answer?.ok
              ? { phase: 'ready', admins: answer.admins }
              : { phase: 'error', code: answer?.code, admins: [] }
          );
        }
      });
    return () => {
      active = false;
    };
  }, [api, chat, tick]);
  return state;
};

const AdminRow = ({ admin, editable, onOpen, t }) => {
  const label =
    admin.role === 'creator'
      ? t('chat.members.owner')
      : t('chat.members.admin');
  return el('li', { className: 'member-row', 'data-admin': admin.id }, [
    el(
      'button',
      {
        key: 'o',
        type: 'button',
        className: 'member-open',
        'data-action': 'open-admin',
        disabled: !editable,
        onClick: () => onOpen(admin),
      },
      [
        el('span', { key: 'n', className: 'member-name' }, admin.name),
        el(
          'span',
          {
            key: 'b',
            className: 'person-badge member-badge',
            'data-role': admin.role,
          },
          admin.rank ? `${label} · ${admin.rank}` : label
        ),
        admin.role === 'admin' && admin.promotedByName
          ? el(
              'span',
              { key: 'p', className: 'meta', 'data-promoted-by': '' },
              t('chat.admins.promotedBy', { name: admin.promotedByName })
            )
          : null,
      ]
    ),
  ]);
};

// Asks to convert the group, converts it, and opens the supergroup.
const UpgradeDialog = ({ api, chat, afterwards, close, leave }) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const upgrade = async () => {
    setBusy(true);
    const answer = await api.telegramGroupUpgrade({ chat }).catch(() => null);
    if (!answer?.ok || !answer.chat) {
      setBusy(false);
      setError(adminErrorText(t, answer?.code ?? 'failed'));
      return;
    }
    // Hiding the history, once a supergroup, was what was asked.
    const next =
      afterwards === 'history'
        ? await api
            .telegramHistoryHidden({ chat: answer.chat, hidden: true })
            .catch(() => null)
        : { ok: true };
    setBusy(false);
    if (!next?.ok) {
      setError(adminErrorText(t, next?.code ?? 'failed'));
    }
    openChat({ source: 'telegram', chat: answer.chat });
    leave();
  };
  return el(
    Aside,
    null,
    el(
      FormDialog,
      {
        name: 'upgrade-group',
        title: t('chat.admins.upgradeTitle'),
        onClose: close,
        onSubmit: upgrade,
        submit: t('chat.admins.upgradeConfirm'),
        busy,
        error,
      },
      el('p', { key: 'p', className: 'meta' }, t('chat.admins.upgradeBody'))
    )
  );
};

// "Chat history for new members": Visible or Hidden.
const HistorySwitch = ({ api, chat, info, kind, upgrade, t }) => {
  const [hidden, setHidden] = useState(Boolean(info.historyHidden));
  const [error, setError] = useState(null);
  const choose = async (wanted) => {
    setError(null);
    if (wanted && kind === 'group') {
      upgrade();
      return;
    }
    const answer = await api
      .telegramHistoryHidden({ chat, hidden: wanted })
      .catch(() => null);
    if (answer?.ok) {
      setHidden(wanted);
    } else {
      setError(adminErrorText(t, answer?.code ?? 'failed'));
    }
  };
  return el('fieldset', { className: 'admin-history' }, [
    el('legend', { key: 'l' }, t('chat.admins.history')),
    ...[false, true].map((value) =>
      el('label', { key: String(value), className: 'chat-pick-row' }, [
        el('input', {
          key: 'i',
          type: 'radio',
          name: 'history',
          'data-history': value ? 'hidden' : 'visible',
          checked: hidden === value,
          onChange: () => choose(value),
        }),
        el(
          'span',
          { key: 's' },
          t(value ? 'chat.admins.historyHidden' : 'chat.admins.historyVisible')
        ),
      ])
    ),
    error
      ? el(
          'p',
          { key: 'e', className: 'chat-form-error', role: 'alert' },
          error
        )
      : null,
  ]);
};

/** The administrators, "Add administrator" and the history switch. */
export const AdminsSection = ({ api, chat, info, leave }) => {
  const t = useT();
  const id = String(chat.chat);
  const kind = kindOf(chat, info);
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState(null);
  const admins = useAdmins(api, id, tick);
  if (
    !hasAdminSection(chat, info) ||
    typeof api?.telegramChatAdmins !== 'function'
  ) {
    return null;
  }
  const close = () => setDialog(null);
  const doneRights = (changed, then) => {
    if (changed) {
      setTick((n) => n + 1);
    }
    setDialog(then === 'upgrade' ? { type: 'upgrade' } : null);
  };
  return el('section', { className: 'admins-section', 'data-admins': '' }, [
    el('h4', { key: 'h' }, t('chat.admins.title')),
    admins.phase === 'error'
      ? el(
          'p',
          { key: 'e', className: 'meta', role: 'alert' },
          adminErrorText(t, admins.code)
        )
      : null,
    el(
      'ul',
      { key: 'l', className: 'member-list' },
      admins.admins.map((admin) =>
        el(AdminRow, {
          key: admin.id,
          admin,
          t,
          editable: canEditAdmin(info, kind, admin),
          onOpen: (a) => setDialog({ type: 'rights', admin: a, edit: true }),
        })
      )
    ),
    info.canAddAdmins
      ? el(
          'button',
          {
            key: 'a',
            type: 'button',
            'data-action': 'add-admin',
            onClick: () => setDialog({ type: 'pick' }),
          },
          t('chat.admins.add')
        )
      : null,
    hasHistorySwitch(chat, info)
      ? el(HistorySwitch, {
          key: 'hs',
          api,
          chat: id,
          info,
          kind,
          t,
          upgrade: () => setDialog({ type: 'upgrade', afterwards: 'history' }),
        })
      : null,
    dialog?.type === 'pick'
      ? el(MemberPicker, {
          key: 'pk',
          api,
          chat: id,
          close,
          choose: (m) => setDialog({ type: 'rights', admin: m, edit: false }),
        })
      : null,
    dialog?.type === 'rights'
      ? el(RightsDialog, {
          key: 'rd',
          api,
          chat: id,
          info,
          kind,
          admin: dialog.admin,
          edit: dialog.edit,
          done: doneRights,
        })
      : null,
    dialog?.type === 'upgrade'
      ? el(UpgradeDialog, {
          key: 'up',
          api,
          chat: id,
          afterwards: dialog.afterwards,
          close,
          leave,
        })
      : null,
  ]);
};
