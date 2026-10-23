// The "Admin rights" dialog and the member picker for "Add administrator",
// as Telegram Desktop has them (R-Y204; learned, never copied): checkboxes
// for the rights that fit the chat's kind (only those the user has
// themselves are enabled), a custom title of up to 16 characters in a
// supergroup, Save, and Dismiss admin for an administrator already made.
// A basic group has no custom rights: it offers the admin switch and
// "Customize rights", which asks to convert the group to a supergroup.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { adminErrorText } from './chat-add-members.js';
import { RANK_MAX, rightsFor } from '../sources/telegram-admin-rights.js';

const el = React.createElement;

/** Whether a right may be given by the user: their own, or the creator. */
export const mayGrant = (info, key) =>
  Boolean(info?.creator || info?.myRights?.[key]);

/** The rights a dialog starts with: the admin's, or none for a new one. */
export const startRights = (admin, kind) =>
  Object.fromEntries(
    rightsFor(kind).map((key) => [key, Boolean(admin?.rights?.[key])])
  );

// A dialog rendered outside the edit form (its submit must not reach it).
export const Aside = ({ children }) =>
  createPortal(
    el('div', { onSubmit: (event) => event.stopPropagation() }, children),
    document.body
  );

const RightBox = ({ right, on, allowed, toggle, t }) =>
  el('label', { className: 'chat-pick-row admin-right' }, [
    el('input', {
      key: 'c',
      type: 'checkbox',
      'data-right': right,
      checked: on,
      disabled: !allowed,
      onChange: () => toggle(right),
    }),
    el('span', { key: 'n' }, t(`chat.admins.right.${right}`)),
  ]);

/** The rights dialog for `admin` (or a new one: `{ id, name }`). */
export const RightsDialog = ({ api, chat, info, kind, admin, edit, done }) => {
  const t = useT();
  const [rights, setRights] = useState(() => startRights(admin, kind));
  const [rank, setRank] = useState(admin.rank ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const group = kind === 'group';
  const ask = async (extra, after) => {
    setBusy(true);
    const answer = await api
      .telegramAdminSet({
        chat,
        user: admin.id,
        broadcast: kind === 'channel',
        ...extra,
      })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      after?.();
      done(true);
    } else {
      setError(adminErrorText(t, answer?.code ?? 'failed'));
    }
  };
  const save = () =>
    group
      ? ask({})
      : ask({
          rights,
          ...(kind === 'supergroup' ? { rank: rank.trim() } : {}),
        });
  const boxes = rightsFor(kind).map((right) =>
    el(RightBox, {
      key: right,
      right,
      t,
      on: rights[right],
      allowed: mayGrant(info, right),
      toggle: (key) => setRights((old) => ({ ...old, [key]: !old[key] })),
    })
  );
  return el(
    Aside,
    null,
    el(
      FormDialog,
      {
        name: 'admin-rights',
        title: t('chat.admins.rightsTitle'),
        onClose: () => done(false),
        onSubmit: save,
        submit: t('chat.admins.save'),
        busy,
        error,
      },
      [
        el('strong', { key: 'who', 'data-admin-name': '' }, admin.name),
        group
          ? el(
              'p',
              { key: 'note', className: 'meta' },
              t('chat.admins.groupNote')
            )
          : el('div', { key: 'r', className: 'admin-rights' }, boxes),
        group
          ? el(
              'button',
              {
                key: 'up',
                type: 'button',
                'data-action': 'customize-rights',
                onClick: () => done(false, 'upgrade'),
              },
              t('chat.admins.customize')
            )
          : null,
        kind === 'supergroup'
          ? el('label', { key: 'rank', className: 'chat-form-field' }, [
              el(
                'span',
                { key: 'l', className: 'meta' },
                t('chat.admins.rank')
              ),
              el('input', {
                key: 'i',
                type: 'text',
                'data-field': 'rank',
                maxLength: RANK_MAX,
                value: rank,
                placeholder: t('chat.admins.rankHint'),
                onChange: (event) => setRank(event.target.value),
              }),
            ])
          : null,
        edit
          ? el(
              'button',
              {
                key: 'dis',
                type: 'button',
                className: 'danger',
                'data-action': 'admin-dismiss',
                disabled: busy,
                onClick: () => ask({ dismiss: true }),
              },
              t('chat.admins.dismiss')
            )
          : null,
      ]
    )
  );
};

/** Pick one member to make an administrator: a search and the people. */
export const MemberPicker = ({ api, chat, close, choose }) => {
  const t = useT();
  const [q, setQ] = useState('');
  const [state, setState] = useState({ phase: 'loading', members: [] });
  useEffect(() => {
    let active = true;
    const timer = globalThis.setTimeout(
      () =>
        api
          .telegramMembers({ chat, q: q.trim(), offset: 0, limit: 50 })
          .catch(() => null)
          .then((answer) => {
            if (active) {
              setState(
                answer?.ok
                  ? { phase: 'ready', members: answer.members }
                  : { phase: 'error', code: answer?.code, members: [] }
              );
            }
          }),
      q ? 300 : 0
    );
    return () => {
      active = false;
      globalThis.clearTimeout(timer);
    };
  }, [api, chat, q]);
  const people = state.members.filter(
    (m) => m.role !== 'creator' && m.role !== 'admin' && !m.self
  );
  return el(
    Aside,
    null,
    el(
      FormDialog,
      {
        name: 'admin-pick',
        title: t('chat.admins.pickTitle'),
        onClose: close,
        onSubmit: close,
        submit: t('chat.admins.done'),
        busy: false,
        error: state.phase === 'error' ? adminErrorText(t, state.code) : null,
      },
      el('div', { className: 'chat-pick' }, [
        el('input', {
          key: 'q',
          type: 'search',
          className: 'chat-search',
          'data-field': 'search',
          placeholder: t('chat.members.search'),
          'aria-label': t('chat.members.search'),
          value: q,
          onChange: (event) => setQ(event.target.value),
        }),
        el(
          'ul',
          { key: 'l', className: 'chat-pick-list' },
          people.map((m) =>
            el(
              'li',
              { key: m.id },
              el(
                'button',
                {
                  type: 'button',
                  className: 'chat-pick-row',
                  'data-pick-admin': m.id,
                  onClick: () => choose(m),
                },
                m.name
              )
            )
          )
        ),
      ])
    )
  );
};
