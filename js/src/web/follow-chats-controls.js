import React from 'react';
import {
  FollowReadControls,
  initialFollowReadForm,
  followReadFormPolicy,
} from './follow-read-controls.js';
import { useT } from './i18n.js';

const el = React.createElement;
const useDiscovery = (api) => {
  const [retryForm, setRetryForm] = React.useState(initialFollowReadForm);
  const [limit, setLimit] = React.useState('25');
  const [telegramOnly, setTelegramOnly] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [details, setDetails] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const turn = React.useRef(0);
  const running = React.useRef(false);
  React.useEffect(
    () => () => {
      turn.current++;
      if (running.current) {
        api
          .followDiscoveryCancel({ requestId: running.current })
          .catch(() => {});
      }
    },
    [api]
  );
  const perform = async (action, input) => {
    if (running.current) {
      return;
    }
    const requestId = globalThis.crypto.randomUUID();
    running.current = requestId;
    const generation = ++turn.current;
    setBusy(true);
    setError('');
    try {
      const retry = followReadFormPolicy(retryForm);
      const result =
        action === 'chats'
          ? await api.followChats({
              source: 'vk',
              retry,
              requestId,
              limit,
              telegramOnly,
              ...input,
            })
          : await api.followChatDetails({
              source: 'vk',
              retry,
              requestId,
              ...input,
            });
      if (generation !== turn.current) {
        return;
      }
      if (action === 'chats') {
        setData(result);
        setDetails(null);
      } else {
        setDetails(result);
      }
    } catch (cause) {
      if (generation === turn.current) {
        setError(cause?.code ?? 'failed');
      }
    } finally {
      running.current = false;
      if (generation === turn.current) {
        setBusy(false);
      }
    }
  };
  const change = (setter, value) => {
    if (running.current) {
      return;
    }
    turn.current++;
    setter(value);
    setData(null);
    setDetails(null);
    setError('');
  };
  return {
    limit,
    retryForm,
    changeRetry: (key, value) =>
      change(setRetryForm, { ...retryForm, [key]: value }),
    stop: () =>
      api
        .followDiscoveryCancel({ requestId: running.current })
        .catch(() => setError('cancel-failed')),
    telegramOnly,
    data,
    details,
    busy,
    error,
    perform,
    setLimit: (value) => change(setLimit, value),
    setTelegramOnly: (value) => change(setTelegramOnly, value),
  };
};
const Button = ({ name, t, busy, disabled, onClick }) =>
  el(
    'button',
    {
      type: 'button',
      disabled: busy || disabled,
      onClick,
      'data-follow-chats-action': name,
    },
    t(`followChats.${name}`)
  );
const identity = (chat, t) => [
  el('strong', { key: 't' }, chat.title || t('followChats.untitled')),
  el('code', { key: 'id' }, `${chat.source}:${chat.chat} · ${chat.localId}`),
  el(
    'span',
    { key: 'm', className: 'meta' },
    t('followChats.memberCount', {
      count: chat.memberCount ?? t('followChats.unknown'),
    })
  ),
];
const Chat = ({ chat, state, t }) =>
  el(
    'article',
    {
      className: 'card col',
      'data-follow-chat': chat.chat,
      style: { minWidth: 0, overflowWrap: 'anywhere' },
    },
    [
      ...identity(chat, t),
      chat.latest
        ? el(
            'p',
            { key: 'l', style: { whiteSpace: 'pre-wrap' } },
            chat.latest.text
          )
        : null,
      el(Button, {
        key: 'd',
        t,
        name: 'details',
        busy: state.busy,
        onClick: () => state.perform('details', { chat: chat.chat }),
      }),
    ]
  );
const PageNote = ({ page, t }) =>
  el(
    'p',
    { className: 'meta' },
    t('followChats.page', {
      offset: page.offset,
      scanned: page.scanned,
      total: page.total ?? t('followChats.unknown'),
    })
  );
const Details = ({ state, t }) => {
  const data = state.details;
  if (!data) {
    return null;
  }
  const page = data.memberPage;
  const move = (memberOffset) =>
    state.perform('details', { chat: data.chat.chat, memberOffset });
  return el(
    'section',
    {
      className: 'card col',
      'data-follow-chat-details': data.chat.chat,
      style: { overflowWrap: 'anywhere', minWidth: 0 },
    },
    [
      ...identity(data.chat, t),
      el('h3', { key: 'mh' }, t('followChats.members')),
      el(PageNote, { key: 'mp', page, t }),
      el(
        'ul',
        { key: 'ml' },
        data.members.map((member) =>
          el(
            'li',
            { key: member.id },
            `${member.name || member.id} · ${member.id}${member.screenName ? ` · @${member.screenName}` : ''}${member.owner ? ` · ${t('followChats.owner')}` : member.admin ? ` · ${t('followChats.admin')}` : ''}`
          )
        )
      ),
      el('div', { key: 'p', className: 'row', style: { flexWrap: 'wrap' } }, [
        el(Button, {
          key: 'b',
          name: 'previousMembers',
          t,
          busy: state.busy,
          disabled: !page.offset,
          onClick: () => move(Math.max(0, page.offset - page.limit)),
        }),
        el(Button, {
          key: 'n',
          name: 'nextMembers',
          t,
          busy: state.busy,
          disabled: !page.more,
          onClick: () => move(page.nextOffset),
        }),
      ]),
      !page.more && !page.complete
        ? el('p', { key: 'partial' }, t('followChats.partial'))
        : null,
      el('h3', { key: 'lh' }, t('followChats.messages')),
      el(PageNote, { key: 'lp', page: data.messagePage, t }),
      ...data.messages.map((message, index) =>
        el(
          'article',
          { key: `${message.id}:${index}`, className: 'card col' },
          [
            el(
              'code',
              { key: 'id' },
              t('followChats.messageIdentity', {
                id: message.id,
                sender: message.sender,
              })
            ),
            el(
              'p',
              { key: 'text', style: { whiteSpace: 'pre-wrap' } },
              message.text
            ),
          ]
        )
      ),
    ]
  );
};
const Fields = ({ state, t }) =>
  el('fieldset', { className: 'col', disabled: state.busy }, [
    el('legend', { key: 'l' }, t('followChats.scope')),
    el('label', { key: 'count', className: 'field' }, [
      el('span', { key: 's' }, t('followChats.limit')),
      el('input', {
        key: 'i',
        type: 'number',
        min: 1,
        max: 200,
        step: 1,
        value: state.limit,
        onChange: (event) => state.setLimit(event.target.value),
      }),
    ]),
    el('label', { key: 'filter', className: 'row' }, [
      el('input', {
        key: 'i',
        type: 'checkbox',
        checked: state.telegramOnly,
        onChange: (event) => state.setTelegramOnly(event.target.checked),
      }),
      el('span', { key: 's' }, t('followChats.telegramOnly')),
    ]),
  ]);
const errorKey = (code) => {
  if (
    [
      'not-connected',
      'follow-server-required',
      'unsupported',
      'captcha',
      'rate-limited',
      'timeout',
      'bad-request',
      'cancelled',
      'stopped',
      'account-changed',
      'cancel-failed',
    ].includes(code)
  ) {
    return code;
  }
  return 'failed';
};
export const FollowChatsControls = ({ api }) => {
  const t = useT();
  const state = useDiscovery(api);
  const page = state.data?.page;
  const button = (name, onClick, disabled = false) =>
    el(Button, { key: name, name, t, busy: state.busy, disabled, onClick });
  return el('details', { className: 'card', 'data-follow-chats-panel': true }, [
    el(
      'summary',
      { key: 's', style: { scrollMarginTop: 72 } },
      t('followChats.title')
    ),
    el('div', { key: 'c', className: 'col', 'aria-busy': state.busy }, [
      el('p', { key: 'h', className: 'meta' }, t('followChats.hint')),
      el(FollowReadControls, {
        key: 'retry',
        form: state.retryForm,
        change: state.changeRetry,
        busy: state.busy,
        t,
      }),
      el(Fields, { key: 'f', state, t }),
      button('load', () => state.perform('chats', { offset: 0 })),
      state.busy
        ? el('p', { key: 'busy', role: 'status' }, t('follow.working'))
        : null,
      state.busy
        ? el(
            'button',
            {
              key: 'stop',
              type: 'button',
              'data-follow-chats-action': 'stop',
              onClick: state.stop,
            },
            t('followRead.stop')
          )
        : null,
      state.error
        ? el(
            'p',
            { key: 'err', role: 'alert' },
            t(`followChats.${errorKey(state.error)}`)
          )
        : null,
      state.data
        ? el(
            'div',
            { key: 'r', className: 'col', 'data-follow-chats-results': true },
            [
              el(PageNote, { key: 'note', page, t }),
              !state.data.chats.length
                ? el('p', { key: 'empty' }, t('followChats.empty'))
                : null,
              ...state.data.chats.map((chat) =>
                el(Chat, { key: chat.chat, chat, state, t })
              ),
              el(
                'div',
                { key: 'p', className: 'row', style: { flexWrap: 'wrap' } },
                [
                  button(
                    'previous',
                    () =>
                      state.perform('chats', {
                        offset: Math.max(0, page.offset - page.limit),
                      }),
                    !page.offset
                  ),
                  button(
                    'next',
                    () => state.perform('chats', { offset: page.nextOffset }),
                    !page.more
                  ),
                ]
              ),
              !page.more && !page.complete
                ? el('p', { key: 'partial' }, t('followChats.partial'))
                : null,
            ]
          )
        : null,
      el(Details, { key: 'd', state, t }),
    ]),
  ]);
};
