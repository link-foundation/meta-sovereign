// A group's or channel's invite links in the info column's manage area,
// as Telegram Desktop's "Invite links" screen (R-Y152; learned, never
// copied), for those who may invite:
// - the primary link with Copy and "Revoke & replace";
// - the other links, each with its title, how many joined (or "2 of 10
//   used"), when it expires and whether admins must approve; Copy, Edit
//   and Revoke on each; a click shows who joined through it;
// - "Create a new link": a title, an expiry (1 hour, 1 day, 1 week or
//   none), a usage limit (none, 1, 10 or 100) or "Request admin approval";
// - revoked links, each deletable, and "Delete all revoked links".
// Member requests open from the same area. Nothing is asked of the
// browser's own dialogs.

import React, { useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { Icon } from './icons.js';
import {
  Failed,
  JoinedList,
  RequestsDialog,
  hasInviteRights,
} from './chat-join-requests.js';

const el = React.createElement;

export const EXPIRIES = [0, 3600, 86400, 604800];
export const LIMITS = [0, 1, 10, 100];

/** Whether the info column offers invite links: those who may invite. */
export const hasInviteLinks = hasInviteRights;

/** The expire date to send (unix seconds) for `choice`; 'keep': none given. */
export const expireOf = (choice, nowMs) => {
  if (choice === 'keep') {
    return undefined;
  }
  const seconds = Number(choice);
  return seconds > 0 ? Math.floor(nowMs / 1000) + seconds : 0;
};

/** The body of a create (`invite` null) or edit call from the form. */
export const bodyOf = (chat, invite, form, nowMs = Date.now()) => {
  const title = form.title.trim();
  const expireDate = expireOf(form.expiry, nowMs);
  const limit = form.approval ? 0 : Number(form.limit);
  if (!invite) {
    return {
      chat,
      ...(title ? { title } : {}),
      ...(expireDate ? { expireDate } : {}),
      ...(limit > 0 ? { usageLimit: limit } : {}),
      ...(form.approval ? { requestNeeded: true } : {}),
    };
  }
  return {
    chat,
    link: invite.link,
    title,
    ...(expireDate === undefined ? {} : { expireDate }),
    usageLimit: limit,
    requestNeeded: form.approval,
  };
};

// The form's start: empty for a new link, the link's own for an edit.
const formOf = (invite) => ({
  title: invite?.title ?? '',
  expiry: invite && invite.expireDate > 0 ? 'keep' : '0',
  limit: String(invite?.usageLimit ?? 0),
  approval: Boolean(invite?.requestNeeded),
});

/** How many joined through a link, in words. */
export const usageText = (t, invite) => {
  if (invite.usageLimit > 0) {
    return t('chat.links.usedOf', {
      used: invite.usage,
      limit: invite.usageLimit,
    });
  }
  return invite.usage > 0
    ? t('chat.links.joined', { count: invite.usage })
    : t('chat.links.noJoins');
};

const expiryText = (t, dates, invite, now) => {
  if (!invite.expireDate) {
    return null;
  }
  return invite.expireDate <= now
    ? t('chat.links.expired')
    : t('chat.links.expires', { when: dates.dateTime(invite.expireDate) });
};

const shortOf = (link) => link.replace(/^https:\/\//, '');

// One call on the links, then `then` on success; the refusal is shown.
const useCall = (reload) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (call, then) => {
    setBusy(true);
    const answer = await call().catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setError(null);
      await reload();
      then?.(answer);
    } else {
      setError(answer?.code ?? 'failed');
    }
    return answer;
  };
  return { busy, error, run };
};

// A list of links, read from the first page, with "Show more".
const useLinks = (api, chat, revoked) => {
  const [state, setState] = useState({ phase: 'loading', links: [] });
  const load = (next) =>
    api
      .telegramInviteLinks({
        chat,
        ...(revoked ? { revoked: true } : {}),
        ...(next ?? {}),
      })
      .catch(() => null)
      .then((answer) =>
        setState((old) =>
          answer?.ok
            ? {
                phase: 'ready',
                primary: answer.primary,
                links: [...(next ? old.links : []), ...answer.links],
                next: answer.next ?? null,
              }
            : { phase: 'error', code: answer?.code ?? 'failed', links: [] }
        )
      );
  useEffect(() => {
    load(null);
  }, [api, chat]);
  return [state, load];
};

const useCopy = () => {
  const [copied, setCopied] = useState(null);
  useEffect(() => {
    if (copied) {
      const timer = globalThis.setTimeout(() => setCopied(null), 2000);
      return () => globalThis.clearTimeout(timer);
    }
    return undefined;
  }, [copied]);
  const copy = (link) =>
    Promise.resolve(globalThis.navigator?.clipboard?.writeText(link))
      .then(() => setCopied(link))
      .catch(() => {});
  return [copied, copy];
};

const Btn = ({ action, label, onClick, disabled, className, icon }) =>
  el(
    'button',
    {
      type: 'button',
      className,
      'data-action': action,
      disabled,
      onClick,
    },
    icon ? [el(Icon, { key: 'i', name: icon, size: 16 }), ` ${label}`] : label
  );

const Primary = ({ t, link, copied, copy, busy, replace }) => {
  const [asking, setAsking] = useState(false);
  return el('section', { className: 'links-primary', 'data-primary': '' }, [
    el('span', { key: 'l', className: 'meta' }, t('chat.links.primary')),
    el('code', { key: 'c', className: 'invite-link-text' }, link),
    el('div', { key: 'b', className: 'invite-link-btns' }, [
      el(Btn, {
        key: 'cp',
        action: 'copy-primary',
        icon: 'copy',
        label:
          copied === link ? t('chat.invite.copied') : t('chat.invite.copy'),
        onClick: () => copy(link),
      }),
      asking
        ? el(Btn, {
            key: 'y',
            action: 'replace-confirm',
            className: 'danger',
            disabled: busy,
            label: t('chat.links.replaceConfirm'),
            onClick: () => replace().then(() => setAsking(false)),
          })
        : el(Btn, {
            key: 'rv',
            action: 'replace',
            label: t('chat.links.replace'),
            onClick: () => setAsking(true),
          }),
    ]),
  ]);
};

const Row = ({ t, dates, invite, copied, copy, on }) => {
  const now = Date.now();
  const facts = [
    usageText(t, invite),
    expiryText(t, dates, invite, now),
    invite.requestNeeded ? t('chat.links.approval') : null,
  ].filter(Boolean);
  return el(
    'li',
    {
      className: 'links-row',
      'data-invite': invite.link,
      'data-revoked': invite.revoked ? '1' : undefined,
    },
    [
      el(
        'button',
        {
          key: 'o',
          type: 'button',
          className: 'links-open',
          'data-action': 'open-link',
          onClick: () => on.joined(invite),
        },
        [
          el('strong', { key: 't' }, invite.title || shortOf(invite.link)),
          el('span', { key: 'f', className: 'meta' }, facts.join(' · ')),
        ]
      ),
      el(
        'span',
        { key: 'a', className: 'links-actions' },
        invite.revoked
          ? [
              el(Btn, {
                key: 'd',
                action: 'delete-link',
                label: t('chat.links.delete'),
                onClick: () => on.remove(invite),
              }),
            ]
          : [
              el(Btn, {
                key: 'c',
                action: 'copy-link',
                label:
                  copied === invite.link
                    ? t('chat.invite.copied')
                    : t('chat.invite.copy'),
                onClick: () => copy(invite.link),
              }),
              el(Btn, {
                key: 'e',
                action: 'edit-link',
                label: t('chat.links.edit'),
                onClick: () => on.edit(invite),
              }),
              el(Btn, {
                key: 'r',
                action: 'revoke-link',
                label: t('chat.links.revoke'),
                onClick: () => on.revoke(invite),
              }),
            ]
      ),
    ]
  );
};

const Choice = ({ name, value, checked, onChange, label }) =>
  el('label', { className: 'admin-toggle' }, [
    el('input', {
      key: 'i',
      type: 'radio',
      name,
      [`data-${name}`]: value,
      checked,
      onChange,
    }),
    el('span', { key: 'l' }, label),
  ]);

const FormFields = ({ t, invite, form, set }) => {
  const limits = LIMITS.includes(invite?.usageLimit ?? 0)
    ? LIMITS
    : [...LIMITS, invite.usageLimit];
  const expiries = [
    ...(invite && invite.expireDate > 0 ? ['keep'] : []),
    ...EXPIRIES,
  ];
  return [
    el('label', { key: 't', className: 'links-field' }, [
      el('span', { key: 'l', className: 'meta' }, t('chat.links.titleField')),
      el('input', {
        key: 'i',
        type: 'text',
        maxLength: 32,
        'data-field': 'title',
        value: form.title,
        placeholder: t('chat.links.titleHint'),
        onChange: (e) => set({ title: e.target.value }),
      }),
    ]),
    el('fieldset', { key: 'e', className: 'admin-slow' }, [
      el('legend', { key: 'l' }, t('chat.links.expiry')),
      ...expiries.map((value) =>
        el(Choice, {
          key: value,
          name: 'expire',
          value,
          checked: form.expiry === String(value),
          onChange: () => set({ expiry: String(value) }),
          label: t(`chat.links.expiry.${value}`),
        })
      ),
    ]),
    el(
      'fieldset',
      { key: 'u', className: 'admin-slow', disabled: form.approval },
      [
        el('legend', { key: 'l' }, t('chat.links.limit')),
        ...limits.map((value) =>
          el(Choice, {
            key: value,
            name: 'limit',
            value,
            checked: form.limit === String(value),
            onChange: () => set({ limit: String(value) }),
            label: value ? String(value) : t('chat.links.unlimited'),
          })
        ),
      ]
    ),
    el('label', { key: 'a', className: 'admin-toggle' }, [
      el('input', {
        key: 'i',
        type: 'checkbox',
        'data-field': 'approval',
        checked: form.approval,
        onChange: (e) => set({ approval: e.target.checked }),
      }),
      el('span', { key: 'l' }, t('chat.links.approvalField')),
    ]),
  ];
};

const LinkForm = ({ t, invite, busy, error, onSave }) => {
  const [form, setForm] = useState(() => formOf(invite));
  const set = (change) => setForm((old) => ({ ...old, ...change }));
  return el('div', { className: 'admin-body', 'data-link-form': '' }, [
    ...FormFields({ t, invite, form, set }),
    el(Failed, { key: 'e', t, code: error }),
    el(Btn, {
      key: 's',
      action: 'save-link',
      className: 'primary',
      disabled: busy,
      label: invite ? t('chat.admin.save') : t('chat.links.create'),
      onClick: () => onSave(form),
    }),
  ]);
};

const LinkList = ({ t, dates, state, load, copyState, on, empty }) => {
  if (state.phase === 'loading') {
    return el('p', { className: 'meta' }, t('chat.admin.loading'));
  }
  if (state.phase === 'error') {
    return el(Failed, { t, code: state.code });
  }
  if (state.links.length === 0) {
    return empty ? el('p', { className: 'meta' }, empty) : null;
  }
  const [copied, copy] = copyState;
  return el('div', null, [
    el(
      'ul',
      { key: 'l', className: 'member-list links-list' },
      state.links.map((invite) =>
        el(Row, { key: invite.link, t, dates, invite, copied, copy, on })
      )
    ),
    state.next
      ? el(Btn, {
          key: 'm',
          action: 'links-more',
          className: 'comments-older',
          label: t('chat.admin.more'),
          onClick: () => load(state.next),
        })
      : null,
  ]);
};

const Lists = ({ api, chat, view, setView }) => {
  const t = useT();
  const dates = useDates();
  const copyState = useCopy();
  const [active, loadActive] = useLinks(api, chat, false);
  const [revoked, loadRevoked] = useLinks(api, chat, true);
  const reload = () => Promise.all([loadActive(null), loadRevoked(null)]);
  const call = useCall(reload);
  const on = {
    joined: (invite) => setView({ name: 'joined', invite }),
    edit: (invite) => setView({ name: 'form', invite }),
    revoke: (invite) =>
      call.run(() =>
        api.telegramInviteEdit({ chat, link: invite.link, revoked: true })
      ),
    remove: (invite) =>
      call.run(() => api.telegramInviteDelete({ chat, link: invite.link })),
  };
  const replace = () => call.run(() => api.telegramInviteRevoke({ chat }));
  const save = (form) =>
    call.run(
      () =>
        view.invite
          ? api.telegramInviteEdit(bodyOf(chat, view.invite, form))
          : api.telegramInviteCreate(bodyOf(chat, null, form)),
      () => setView({ name: 'list' })
    );
  if (view.name === 'form') {
    return el(LinkForm, {
      t,
      invite: view.invite,
      busy: call.busy,
      error: call.error,
      onSave: save,
    });
  }
  if (view.name === 'joined') {
    return el(JoinedList, { api, chat: { chat }, link: view.invite.link });
  }
  const primary = active.primary;
  return el('div', { className: 'admin-body' }, [
    primary
      ? el(Primary, {
          key: 'p',
          t,
          link: primary,
          copied: copyState[0],
          copy: copyState[1],
          busy: call.busy,
          replace,
        })
      : null,
    el(Btn, {
      key: 'n',
      action: 'new-link',
      className: 'primary',
      label: t('chat.links.new'),
      onClick: () => setView({ name: 'form' }),
    }),
    el(Failed, { key: 'e', t, code: call.error }),
    el('h4', { key: 'h' }, t('chat.links.additional')),
    el(LinkList, {
      key: 'a',
      t,
      dates,
      state: active,
      load: loadActive,
      copyState,
      on,
      empty: t('chat.links.none'),
    }),
    revoked.links.length > 0
      ? el('div', { key: 'rv', className: 'links-revoked' }, [
          el('h4', { key: 'h' }, t('chat.links.revoked')),
          el(LinkList, {
            key: 'l',
            t,
            dates,
            state: revoked,
            load: loadRevoked,
            copyState,
            on,
          }),
          el(Btn, {
            key: 'd',
            action: 'delete-revoked',
            className: 'danger',
            disabled: call.busy,
            label: t('chat.links.deleteRevoked'),
            onClick: () =>
              call.run(() => api.telegramInviteDeleteRevoked({ chat })),
          }),
        ])
      : null,
  ]);
};

const LinksDialog = ({ api, chat, close }) => {
  const t = useT();
  const [view, setView] = useState({ name: 'list' });
  const title = {
    list: t('chat.links.title'),
    form: view.invite ? t('chat.links.editTitle') : t('chat.links.newTitle'),
    joined: view.invite?.title || t('chat.links.joinedTitle'),
  }[view.name];
  return el(Frame, { title, close, name: 'invite-links' }, [
    view.name === 'list'
      ? null
      : el(Btn, {
          key: 'back',
          action: 'back',
          label: t('chat.links.back'),
          onClick: () => setView({ name: 'list' }),
        }),
    el(Lists, { key: 'l', api, chat: String(chat.chat), view, setView }),
  ]);
};

/** Invite links and Member requests for those who may invite, or nothing. */
export const InviteLinksActions = ({ api, chat, info }) => {
  const t = useT();
  const [open, setOpen] = useState(null);
  if (
    !hasInviteLinks(chat, info) ||
    typeof api?.telegramInviteLinks !== 'function'
  ) {
    return null;
  }
  const close = () => setOpen(null);
  const pending = Number(info.requestsPending ?? 0);
  return el('div', { className: 'admin-actions', 'data-invite-actions': '' }, [
    el(Btn, {
      key: 'links',
      action: 'invite-links',
      className: 'admin-open',
      label: t('chat.links.title'),
      onClick: () => setOpen('links'),
    }),
    el(Btn, {
      key: 'req',
      action: 'join-requests',
      className: 'admin-open',
      label:
        pending > 0
          ? `${t('chat.requests.title')} (${pending})`
          : t('chat.requests.title'),
      onClick: () => setOpen('requests'),
    }),
    open === 'links' ? el(LinksDialog, { key: 'ld', api, chat, close }) : null,
    open === 'requests'
      ? el(RequestsDialog, {
          key: 'rd',
          api,
          chat,
          close,
          onCount: () => {},
        })
      : null,
  ]);
};
