// Who asks to join a group or channel, and who joined through a link, as
// Telegram Desktop shows them (R-Y152; learned, never copied):
// - a slim bar under the chat's header, "N requested to join" with the
//   latest requesters' avatars, for those who may invite; a click opens
//   the list of requests;
// - the list: each person with their avatar, name, when they asked and
//   the text they wrote, Approve and Dismiss on each, and Approve all /
//   Dismiss all (asked once in the page, never by the browser);
// - the list of those who joined through one link (no buttons).
// Telegram's refusals are told in words.

import React, { useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { PeerAvatar } from './peer-avatar.js';

const el = React.createElement;

/** Whether the chat offers invite links and requests: those who may invite. */
export const hasInviteRights = (chat, info) =>
  chat?.source === 'telegram' &&
  /^-\d+$/.test(String(chat.chat)) &&
  Boolean(info?.canInvite) &&
  info.kind !== 'user';

/** Telegram's refusal `code` in words. */
export const errorText = (t, code) => {
  const key = `chat.links.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.links.err.failed') : text;
};

export const Failed = ({ t, code }) =>
  code
    ? el(
        'p',
        {
          className: 'comments-failed',
          role: 'alert',
          'data-links-error': code,
        },
        errorText(t, code)
      )
    : null;

/**
 * The people of one list (`scope`: `{ link }` or `{ requested: true }`),
 * a page at a time: `[state, more, drop]`; `drop(id)` takes one away.
 */
export const useImporters = (api, chat, scope) => {
  const [state, setState] = useState({ phase: 'loading', rows: [], count: 0 });
  const key = JSON.stringify(scope);
  const load = (offset) =>
    api
      .telegramInviteImporters({
        chat,
        ...scope,
        ...(offset ? { offset } : {}),
      })
      .catch(() => null)
      .then((answer) =>
        setState((old) =>
          answer?.ok
            ? {
                phase: 'ready',
                rows: [...(offset ? old.rows : []), ...answer.importers],
                count: answer.count,
                next: answer.next ?? null,
              }
            : {
                phase: 'error',
                code: answer?.code ?? 'failed',
                rows: [],
                count: 0,
              }
        )
      );
  useEffect(() => {
    setState({ phase: 'loading', rows: [], count: 0 });
    load(null);
  }, [api, chat, key]);
  const drop = (ids) =>
    setState((old) => ({
      ...old,
      rows: old.rows.filter((r) => !ids.includes(r.id)),
      count: Math.max(0, old.count - ids.length),
    }));
  return [state, load, drop];
};

const Buttons = ({ t, busy, onYes, onNo }) =>
  el('span', { className: 'requests-buttons' }, [
    el(
      'button',
      {
        key: 'y',
        type: 'button',
        className: 'primary',
        'data-action': 'approve',
        disabled: busy,
        onClick: onYes,
      },
      t('chat.requests.approve')
    ),
    el(
      'button',
      {
        key: 'n',
        type: 'button',
        'data-action': 'dismiss',
        disabled: busy,
        onClick: onNo,
      },
      t('chat.requests.dismiss')
    ),
  ]);

/** One person: avatar, name, date, their words; buttons for a request. */
export const PersonRow = ({ api, person, dates, buttons }) =>
  el('li', { className: 'requests-row', 'data-person': person.id }, [
    el(PeerAvatar, {
      key: 'a',
      api,
      source: 'telegram',
      peer: person.id,
      name: person.name,
      className: 'avatar requests-avatar',
    }),
    el('div', { key: 't', className: 'requests-text' }, [
      el('strong', { key: 'n', className: 'member-name' }, person.name),
      el('span', { key: 'd', className: 'meta' }, dates.dateTime(person.date)),
      person.about
        ? el('p', { key: 'b', className: 'requests-about' }, person.about)
        : null,
    ]),
    buttons,
  ]);

export const MoreButton = ({ t, next, load }) =>
  next
    ? el(
        'button',
        {
          type: 'button',
          className: 'comments-older',
          'data-action': 'people-more',
          onClick: () => load(next),
        },
        t('chat.admin.more')
      )
    : null;

// Everyone at once, asked once: "Approve all 3 requests?" Yes / Cancel.
const AllBar = ({ t, count, busy, asking, setAsking, decide }) =>
  asking === null
    ? el('div', { className: 'requests-all' }, [
        el(
          'button',
          {
            key: 'a',
            type: 'button',
            'data-action': 'approve-all',
            onClick: () => setAsking(true),
          },
          t('chat.requests.approveAll')
        ),
        el(
          'button',
          {
            key: 'd',
            type: 'button',
            'data-action': 'dismiss-all',
            onClick: () => setAsking(false),
          },
          t('chat.requests.dismissAll')
        ),
      ])
    : el('div', { className: 'requests-all', 'data-requests-confirm': '' }, [
        el(
          'span',
          { key: 'q' },
          t(
            asking
              ? 'chat.requests.approveAllAsk'
              : 'chat.requests.dismissAllAsk',
            {
              count,
            }
          )
        ),
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: asking ? 'primary' : 'danger',
            'data-action': 'all-confirm',
            disabled: busy,
            onClick: () => decide(asking),
          },
          t(asking ? 'chat.requests.approve' : 'chat.requests.dismiss')
        ),
        el(
          'button',
          {
            key: 'c',
            type: 'button',
            'data-action': 'all-cancel',
            onClick: () => setAsking(null),
          },
          t('chat.invite.cancel')
        ),
      ]);

const RequestsBody = ({ api, chat, state, load, drop, onCount }) => {
  const t = useT();
  const dates = useDates();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(null);
  useEffect(() => {
    if (state.phase === 'ready') {
      onCount(state.count);
    }
  }, [state.phase, state.count]);
  const finish = (answer, ids) => {
    setBusy(false);
    // A request somebody else already decided is gone either way.
    if (answer?.ok || answer?.code === 'request-gone') {
      setError(null);
      drop(ids);
    } else {
      setError(answer?.code ?? 'failed');
    }
  };
  const decideOne = async (person, approved) => {
    setBusy(true);
    const answer = await api
      .telegramJoinRequestHide({
        chat,
        user: person.id,
        approved,
        ...(person.accessHash ? { accessHash: person.accessHash } : {}),
      })
      .catch(() => null);
    finish(answer, [person.id]);
  };
  const decideAll = async (approved) => {
    setBusy(true);
    const answer = await api
      .telegramJoinRequestsHideAll({ chat, approved })
      .catch(() => null);
    setAsking(null);
    finish(
      answer,
      state.rows.map((r) => r.id)
    );
    if (answer?.ok) {
      onCount(0);
    }
  };
  if (state.phase === 'loading') {
    return el('p', { className: 'meta' }, t('chat.admin.loading'));
  }
  if (state.phase === 'error') {
    return el(Failed, { t, code: state.code });
  }
  if (state.rows.length === 0) {
    return el('p', { className: 'meta' }, t('chat.requests.empty'));
  }
  return el('div', null, [
    el(AllBar, {
      key: 'all',
      t,
      count: state.count,
      busy,
      asking,
      setAsking,
      decide: decideAll,
    }),
    el(Failed, { key: 'e', t, code: error }),
    el(
      'ul',
      { key: 'l', className: 'member-list requests-list' },
      state.rows.map((person) =>
        el(PersonRow, {
          key: person.id,
          api,
          person,
          dates,
          buttons: el(Buttons, {
            t,
            busy,
            onYes: () => decideOne(person, true),
            onNo: () => decideOne(person, false),
          }),
        })
      )
    ),
    el(MoreButton, { key: 'm', t, next: state.next, load }),
  ]);
};

/** The list of people waiting to be let in. */
export const RequestsDialog = ({ api, chat, close, onCount }) => {
  const t = useT();
  const key = String(chat.chat);
  const [state, load, drop] = useImporters(api, key, { requested: true });
  return el(
    Frame,
    { title: t('chat.requests.title'), close, name: 'join-requests' },
    el(RequestsBody, { api, chat: key, state, load, drop, onCount })
  );
};

/** The list of those who joined through `link`. */
export const JoinedList = ({ api, chat, link }) => {
  const t = useT();
  const dates = useDates();
  const [state, load] = useImporters(api, String(chat.chat), { link });
  if (state.phase === 'loading') {
    return el('p', { className: 'meta' }, t('chat.admin.loading'));
  }
  if (state.phase === 'error') {
    return el(Failed, { t, code: state.code });
  }
  if (state.rows.length === 0) {
    return el('p', { className: 'meta' }, t('chat.links.nobody'));
  }
  return el('div', { 'data-joined': '' }, [
    el(
      'ul',
      { key: 'l', className: 'member-list requests-list' },
      state.rows.map((person) =>
        el(PersonRow, { key: person.id, api, person, dates, buttons: null })
      )
    ),
    el(MoreButton, { key: 'm', t, next: state.next, load }),
  ]);
};

/**
 * The slim bar under the header, "N requested to join" with the latest
 * requesters' faces, for those who may invite; it opens the requests.
 */
export const RequestsBar = ({ api, chat, info }) => {
  const t = useT();
  const [pending, setPending] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setPending(
      hasInviteRights(chat, info) ? Number(info.requestsPending ?? 0) : 0
    );
  }, [chat?.chat, info]);
  if (!hasInviteRights(chat, info) || (pending <= 0 && !open)) {
    return null;
  }
  const faces = (info.recentRequesters ?? []).slice(0, 3);
  return el('div', { className: 'requests-bar-wrap' }, [
    pending > 0
      ? el(
          'button',
          {
            key: 'b',
            type: 'button',
            className: 'requests-bar',
            'data-requests-bar': String(chat.chat),
            onClick: () => setOpen(true),
          },
          [
            el(
              'span',
              { key: 'f', className: 'requests-faces' },
              faces.map((p) =>
                el(PeerAvatar, {
                  key: p.id,
                  api,
                  source: 'telegram',
                  peer: p.id,
                  name: p.name,
                  className: 'avatar requests-face',
                })
              )
            ),
            el(
              'span',
              { key: 't' },
              t('chat.requests.bar', { count: pending })
            ),
          ]
        )
      : null,
    open
      ? el(RequestsDialog, {
          key: 'd',
          api,
          chat,
          close: () => setOpen(false),
          onCount: setPending,
        })
      : null,
  ]);
};
