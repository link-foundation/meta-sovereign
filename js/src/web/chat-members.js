// A group's members in the info column, as Telegram Desktop lists them
// (R-Y125; learned, never copied): the count, a search box, and a row for
// each person — initial, name, an "owner" or "admin" badge with the rank
// when there is one. A row opens that person's chat. Those who may ban
// get "Remove" on the other rows; it is asked in the page (never by the
// browser) and the row goes once the server answers. More are read by a
// button.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { openChat } from './chat-state.js';
import { useEsc } from './chat-invite.js';
import { ModerateDialog, moderationOptions } from './chat-moderation.js';
import { useMembersChanged } from './chat-add-members.js';

const el = React.createElement;
const PAGE = 50;
const TYPING_MS = 300;

/** Whether the info column lists members: a group, not a channel. */
export const hasMembers = (chat, info) =>
  chat?.source === 'telegram' &&
  /^-\d+$/.test(String(chat.chat)) &&
  Boolean(info) &&
  info.kind !== 'user' &&
  !info.broadcast;

const errorText = (t, code) => {
  const key = `chat.members.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.members.err.failed') : text;
};

// Pages of members: the first for the words typed, then the rest.
const useMembers = (api, chat, q) => {
  const [state, setState] = useState({ phase: 'loading', members: [] });
  const asking = useRef(0);
  // People added by "Add members" (R-Y204): the list is read again.
  const changed = useMembersChanged();
  const read = (offset) => {
    const token = ++asking.current;
    api
      .telegramMembers({ chat, q, offset, limit: PAGE })
      .catch(() => null)
      .then((answer) => {
        if (token !== asking.current) {
          return;
        }
        setState((old) =>
          answer?.ok
            ? {
                phase: 'ready',
                total: answer.total,
                canBan: Boolean(answer.canBan),
                canDelete: Boolean(answer.canDelete),
                owner: Boolean(answer.owner),
                members: [...(offset ? old.members : []), ...answer.members],
                done: answer.members.length < PAGE,
              }
            : { phase: 'error', code: answer?.code ?? 'failed', members: [] }
        );
      });
  };
  useEffect(() => {
    const timer = globalThis.setTimeout(() => read(0), q ? TYPING_MS : 0);
    return () => globalThis.clearTimeout(timer);
  }, [api, chat, q, changed]);
  return [state, setState, () => read(state.members.length)];
};

const Badge = ({ member, t }) => {
  if (member.role !== 'creator' && member.role !== 'admin') {
    return null;
  }
  const label =
    member.role === 'creator'
      ? t('chat.members.owner')
      : t('chat.members.admin');
  return el(
    'span',
    { className: 'person-badge member-badge', 'data-role': member.role },
    member.rank ? `${label} · ${member.rank}` : label
  );
};

// A row's extra button (R-Y200): moderate (ban, delete all).
const RowExtras = ({ on, t }) => [
  on.moderate
    ? el(
        'button',
        {
          key: 'm',
          type: 'button',
          className: 'member-remove',
          'data-action': 'moderate-member',
          onClick: () => on.moderate(),
        },
        t('chat.mod.menu')
      )
    : null,
];

const Row = ({ member, canRemove, onRemove, extras, t }) =>
  el('li', { className: 'member-row', 'data-member': member.id }, [
    el(
      'button',
      {
        key: 'o',
        type: 'button',
        className: 'member-open',
        'data-action': 'open-member',
        onClick: () => openChat({ source: 'telegram', chat: member.id }),
      },
      [
        el(
          'span',
          { key: 'a', className: 'member-initial', 'aria-hidden': 'true' },
          Array.from(member.name)[0]?.toUpperCase() ?? '?'
        ),
        el('span', { key: 'n', className: 'member-name' }, member.name),
        el(Badge, { key: 'b', member, t }),
      ]
    ),
    canRemove
      ? el(
          'button',
          {
            key: 'r',
            type: 'button',
            className: 'member-remove',
            'data-action': 'remove-member',
            onClick: () => onRemove(member),
          },
          t('chat.members.remove')
        )
      : null,
    el(RowExtras, { key: 'x', on: extras, t }),
  ]);

const RemoveDialog = ({ member, busy, error, onYes, onNo, t }) => {
  useEsc(onNo);
  const title = t('chat.members.removeTitle');
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
      'data-dialog': 'member-remove',
    },
    el('div', { className: 'delete-dialog' }, [
      el('h3', { key: 'h' }, title),
      el(
        'p',
        { key: 'p' },
        t('chat.members.removeBody', { name: member.name })
      ),
      error ? el('p', { key: 'e', role: 'alert' }, errorText(t, error)) : null,
      el('div', { key: 'b', className: 'delete-dialog-btns' }, [
        el(
          'button',
          { key: 'n', type: 'button', 'data-action': 'cancel', onClick: onNo },
          t('chat.invite.cancel')
        ),
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: 'danger',
            'data-action': 'remove-confirm',
            disabled: busy,
            onClick: onYes,
          },
          t('chat.members.removeConfirm')
        ),
      ]),
    ])
  );
};

// The member being asked about, removed when the user agrees.
const useRemoval = (api, chat, setState) => {
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const close = () => {
    setAsking(null);
    setError(null);
  };
  const confirm = async () => {
    setBusy(true);
    const answer = await api
      .telegramMemberRemove({ chat, user: asking.id })
      .catch(() => null);
    setBusy(false);
    if (!answer?.ok) {
      setError(answer?.code ?? 'failed');
      return;
    }
    setState((old) => ({
      ...old,
      total: Math.max(0, (old.total ?? 1) - 1),
      members: old.members.filter((m) => m.id !== asking.id),
    }));
    close();
  };
  return { asking, busy, error, ask: setAsking, close, confirm };
};

const removable = (state, member) =>
  state.canBan &&
  !member.self &&
  member.role !== 'creator' &&
  member.role !== 'admin';

// What a row may be asked beyond Remove (R-Y200): ban or delete all in a
// supergroup (not oneself, not an admin).
const extrasOf = (api, chat, state, open) => {
  const options = moderationOptions({
    canBan: state.canBan,
    canDeleteMessages: state.canDelete,
  });
  const supergroup = /^-100/.test(String(chat.chat));
  return (member) => ({
    moderate:
      supergroup &&
      options.length > 0 &&
      !member.self &&
      member.role !== 'creator' &&
      member.role !== 'admin'
        ? () => open({ kind: 'moderate', member, options })
        : null,
  });
};

// The dialog a row's extra button opened (R-Y200).
const ExtraDialog = ({ api, chat, open, close, done }) =>
  open?.kind === 'moderate'
    ? el(ModerateDialog, {
        api,
        chat: String(chat.chat),
        member: open.member,
        options: open.options,
        close,
        done: (what) => done(open, what),
      })
    : null;

const MembersBody = ({ api, chat }) => {
  const t = useT();
  const [q, setQ] = useState('');
  const [state, setState, more] = useMembers(api, String(chat.chat), q.trim());
  const removal = useRemoval(api, String(chat.chat), setState);
  const [extra, setExtra] = useState(null);
  const extras = extrasOf(api, chat, state, setExtra);
  const { members, phase } = state;
  return el('section', { className: 'person-section chat-members' }, [
    el(
      'h3',
      { key: 'h', 'data-members-count': state.total ?? '' },
      Number.isInteger(state.total)
        ? t('chat.info.members', { count: state.total })
        : t('chat.members.title')
    ),
    el('input', {
      key: 's',
      type: 'search',
      className: 'member-search',
      value: q,
      maxLength: 64,
      placeholder: t('chat.members.search'),
      'aria-label': t('chat.members.search'),
      onChange: (e) => setQ(e.target.value),
    }),
    phase === 'error'
      ? el(
          'p',
          { key: 'e', className: 'meta', role: 'alert' },
          errorText(t, state.code)
        )
      : null,
    el(
      'ul',
      { key: 'l', className: 'member-list' },
      members.map((member) =>
        el(Row, {
          key: member.id,
          member,
          t,
          canRemove: removable(state, member),
          onRemove: removal.ask,
          extras: extras(member),
        })
      )
    ),
    phase === 'ready' && !members.length
      ? el('p', { key: 'n', className: 'meta' }, t('chat.members.none'))
      : null,
    phase === 'ready' && !state.done
      ? el(
          'button',
          {
            key: 'm',
            type: 'button',
            'data-action': 'more-members',
            onClick: more,
          },
          t('chat.members.more')
        )
      : null,
    el(ExtraDialog, {
      key: 'x',
      api,
      chat,
      open: extra,
      close: () => setExtra(null),
      done: (was, what) => {
        setExtra(null);
        // A banned member leaves the list.
        if (what.banned) {
          setState((old) => ({
            ...old,
            total: Math.max(0, (old.total ?? 1) - 1),
            members: old.members.filter((m) => m.id !== was.member.id),
          }));
        }
      },
    }),
    removal.asking
      ? el(RemoveDialog, {
          key: 'd',
          member: removal.asking,
          busy: removal.busy,
          error: removal.error,
          onYes: removal.confirm,
          onNo: removal.close,
          t,
        })
      : null,
  ]);
};

/** A group's members, or nothing for a person, a channel, no server. */
export const Members = ({ api, chat, info }) =>
  hasMembers(chat, info) && typeof api?.telegramMembers === 'function'
    ? el(MembersBody, { key: String(chat.chat), api, chat })
    : null;
