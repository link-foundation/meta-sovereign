// The chat screen (issue #31 / PR #34), styled after t3.codes by default
// and re-skinnable (Telegram, WhatsApp, Signal — see app.css `data-skin`):
//
//   - a searchable conversation list with names, previews and date
//     sections;
//   - the conversation in a centred column, with "typing…" for the other
//     side and for an automation typing on the user's behalf;
//   - a floating composer that suggests whole replies we gave to the
//     last message before, then word by word from our own messages,
//     and shows our typing status while the user types;
//   - a menu that runs or tests an automation in this chat, and the
//     drafts automations left here: send (one click is the
//     confirmation), edit, switch "ты"/"вы", mark as sent by hand, skip.

import React, { useEffect, useRef, useState } from 'react';
import { api as defaultApi } from './dom.js';
import { sentence, useDates, useT } from './i18n.js';
import { ConnectionGuide } from './connection-guide.js';
import { ChatAccountEmpty, ChatAccountLine } from './chat-account.js';
import { networkName } from './connection-guides.js';
import { avatarFor, groupChats } from './chat-model.js';
import { presetName } from './automations-model.js';
import { useChatState } from './chat-state.js';
import { Icon } from './icons.js';
import { Notice } from './notice.js';
export { reasonText } from './notice.js';

const el = React.createElement;

const Avatar = ({ name, small }) => {
  const { initials, hue } = avatarFor(name);
  return el(
    'span',
    {
      className: small ? 'avatar small' : 'avatar',
      style: { '--avatar-hue': hue },
      'aria-hidden': 'true',
    },
    initials
  );
};

const ChatItem = ({ chat, active, onSelect }) => {
  const t = useT();
  const { chatTime } = useDates();
  return el(
    'button',
    {
      type: 'button',
      className: active ? 'chat-item active' : 'chat-item',
      'data-chat': chat.key,
      'aria-current': active ? 'true' : undefined,
      onClick: () => onSelect(chat.key),
    },
    [
      el(Avatar, { key: 'a', name: chat.name }),
      el('span', { key: 'b', className: 'chat-item-body' }, [
        el('span', { key: 'top', className: 'chat-item-top' }, [
          el('span', { key: 'n', className: 'chat-item-name' }, chat.name),
          el(
            'span',
            { key: 't', className: 'chat-item-time' },
            chatTime(chat.last.at)
          ),
        ]),
        el('span', { key: 'bottom', className: 'chat-item-bottom' }, [
          el(
            'span',
            { key: 'p', className: 'chat-item-preview' },
            `${chat.last.mine ? `${t('chat.you')}: ` : ''}${chat.last.body}`
          ),
          el(
            'span',
            { key: 's', className: 'chat-item-source' },
            networkName(t, chat.source)
          ),
        ]),
      ]),
    ]
  );
};

const Sidebar = ({ state }) => {
  const t = useT();
  return el('aside', { className: 'chat-sidebar' }, [
    el('div', { key: 'h', className: 'chat-sidebar-head' }, [
      el(
        'span',
        { key: 't', className: 'chat-sidebar-title' },
        t('chat.aside')
      ),
      el('input', {
        key: 'q',
        type: 'search',
        className: 'chat-search',
        placeholder: t('chat.search'),
        'aria-label': t('chat.search'),
        value: state.query,
        onChange: (event) => state.setQuery(event.target.value),
      }),
    ]),
    el(
      'nav',
      { key: 'list', className: 'chat-list', 'aria-label': t('chat.aside') },
      state.chats.length === 0
        ? [el('p', { key: 'none', className: 'meta' }, t('chat.noMatches'))]
        : groupChats(state.chats).map(({ group, chats }) =>
            el('section', { key: group, className: 'chat-group' }, [
              el('h3', { key: 'h' }, t(`chat.group.${group}`)),
              ...chats.map((chat) =>
                el(ChatItem, {
                  key: chat.key,
                  chat,
                  active: chat.key === state.current?.key,
                  onSelect: state.select,
                })
              ),
            ])
          )
    ),
    el(ChatAccountLine, { key: 'acct', telegram: state.telegram }),
  ]);
};

const isTyping = (typing) =>
  Boolean(typing.automation) || typing.people.length > 0;

const TypingLine = ({ typing }) => {
  const t = useT();
  if (typing.automation) {
    return el(
      'span',
      { className: 'typing', 'data-typing': 'automation' },
      t('chat.typingAutomation', {
        name: presetName(t, typing.automation),
      })
    );
  }
  if (typing.people.length > 0) {
    return el(
      'span',
      { className: 'typing', 'data-typing': 'people' },
      t('chat.typing', { names: typing.people.join(', ') })
    );
  }
  return null;
};

const AutomationMenu = ({ menu }) => {
  const t = useT();
  return el('div', { className: 'chat-menu' }, [
    el(
      'button',
      {
        key: 'toggle',
        type: 'button',
        className: 'chat-menu-toggle',
        'aria-expanded': menu.open ? 'true' : 'false',
        'data-action': 'chat-automations',
        onClick: menu.toggle,
      },
      [
        el(Icon, { key: 'i', name: 'automation', size: 16 }),
        el('span', { key: 'l' }, t('chat.automations')),
      ]
    ),
    menu.open
      ? el(
          'div',
          { key: 'list', className: 'chat-menu-list', role: 'menu' },
          menu.automations.length === 0
            ? [
                el(
                  'p',
                  { key: 'none', className: 'meta' },
                  t('chat.automation.none')
                ),
              ]
            : menu.automations.map((a) =>
                el('div', { key: a.id, className: 'chat-menu-item' }, [
                  el('span', { key: 'n', className: 'chat-menu-name' }, [
                    el('strong', { key: 'n' }, a.name),
                    el(
                      'small',
                      { key: 'm', className: 'meta' },
                      sentence(t(`automations.mode.${a.mode}`))
                    ),
                  ]),
                  el(
                    'button',
                    {
                      key: 'test',
                      type: 'button',
                      role: 'menuitem',
                      'data-action': 'chat-automation-test',
                      'data-automation': a.id,
                      onClick: () => menu.run(a, { test: true }),
                    },
                    t('chat.automation.test')
                  ),
                  el(
                    'button',
                    {
                      key: 'run',
                      type: 'button',
                      role: 'menuitem',
                      'data-action': 'chat-automation-run',
                      onClick: () => menu.run(a, { test: false }),
                    },
                    t('chat.automation.run')
                  ),
                ])
              )
        )
      : null,
  ]);
};

const Header = ({ state, onBack }) => {
  const t = useT();
  const chat = state.current;
  return el('header', { className: 'chat-header' }, [
    el(
      'button',
      {
        key: 'back',
        type: 'button',
        className: 'chat-back icon-btn',
        'data-action': 'chat-back',
        'aria-label': t('chat.back'),
        title: t('chat.back'),
        onClick: onBack,
      },
      el(Icon, { name: 'back' })
    ),
    el(Avatar, { key: 'a', name: chat.name }),
    el('div', { key: 't', className: 'chat-header-title' }, [
      el('strong', { key: 'n' }, chat.name),
      el(
        'span',
        { key: 's', className: 'meta' },
        isTyping(state.typing)
          ? el(TypingLine, { typing: state.typing })
          : t(
              chat.personal ? 'chat.subtitle.personal' : 'chat.subtitle.group',
              {
                source: networkName(t, chat.source),
                count: chat.people.length,
              }
            )
      ),
    ]),
    el(AutomationMenu, { key: 'm', menu: state.menu }),
  ]);
};

// A message's delivery, as messengers show it: a clock while it goes
// out, ✓ once the network has it, ✓✓ once the other side read it, ! when
// it failed. A message kept here while offline shows the clock too.
const DELIVERY_ICON = {
  sending: 'clock',
  stored: 'clock',
  sent: 'check',
  read: 'check-double',
  failed: 'alert',
};

const Delivery = ({ status }) => {
  const t = useT();
  const label = t(`chat.delivery.${status}`);
  return el(
    'span',
    {
      className: `bubble-status ${status}`,
      'data-delivery': status,
      title: label,
      role: 'img',
      'aria-label': label,
    },
    el(Icon, { name: DELIVERY_ICON[status] ?? 'check', size: 14 })
  );
};

/** Why a message did not go out, in words. */
export const failureText = (t, message) => {
  switch (message.code) {
    case 'flood-wait':
      return t('chat.failure.floodWait', {
        seconds: message.retryAfter ?? '?',
      });
    case 'write-forbidden':
      return t('chat.failure.forbidden');
    case 'unknown-chat':
      return t('chat.failure.unknownChat');
    case 'too-long':
      return t('chat.failure.tooLong');
    default:
      return t('chat.failure.other', {
        error: message.error ?? message.code ?? '',
      });
  }
};

const FailedActions = ({ message, composer }) => {
  const t = useT();
  return el('div', { className: 'bubble-failed', role: 'alert' }, [
    el('span', { key: 'why' }, failureText(t, message)),
    el(
      'button',
      {
        key: 'retry',
        type: 'button',
        'data-action': 'retry',
        onClick: () => composer.retry(message.clientId),
      },
      t('chat.failure.retry')
    ),
    el(
      'button',
      {
        key: 'discard',
        type: 'button',
        'data-action': 'discard',
        onClick: () => composer.discard(message.clientId),
      },
      t('chat.failure.discard')
    ),
  ]);
};

const Message = ({ message, showName, composer }) => {
  const t = useT();
  const { time } = useDates();
  const mine = message.sender === 'me';
  const failed = message.delivery === 'failed';
  return el(
    'div',
    {
      className: [
        'bubble',
        mine ? 'out' : 'in',
        message.pending ? 'pending' : null,
        failed ? 'failed' : null,
      ]
        .filter(Boolean)
        .join(' '),
      'data-message': message.id,
      ...(message.delivery ? { 'data-delivery': message.delivery } : {}),
    },
    [
      showName && !mine
        ? el(
            'span',
            { key: 'who', className: 'bubble-name' },
            message.senderName ?? message.sender
          )
        : null,
      el('span', { key: 'body', className: 'bubble-body' }, message.body ?? ''),
      el('span', { key: 'time', className: 'bubble-time' }, [
        message.edited
          ? el(
              'span',
              { key: 'e', className: 'bubble-edited', title: message.edited },
              t('chat.edited')
            )
          : null,
        `${time(message.timestamp)}${message.via === 'browser' ? ' · web' : ''}`,
        message.delivery
          ? el(Delivery, { key: 'd', status: message.delivery })
          : null,
      ]),
      failed && composer
        ? el(FailedActions, { key: 'f', message, composer })
        : null,
    ]
  );
};

const FORM_KEYS = {
  informal: 'chat.form.informal',
  formal: 'chat.form.formal',
};

const DraftCard = ({ draft, drafts }) => {
  const t = useT();
  const other = draft.form === 'formal' ? 'informal' : 'formal';
  const button = (action, label, extra = {}) =>
    el(
      'button',
      {
        key: action,
        type: 'button',
        'data-action': `draft-${action}`,
        onClick: () => drafts.act(action, { ...draft, ...extra }),
        className: action === 'send' ? 'primary' : undefined,
      },
      label
    );
  return el(
    'div',
    {
      className: 'draft-card',
      'data-draft': draft.id,
      'data-form': draft.form,
    },
    [
      el(
        'p',
        { key: 'h', className: 'meta' },
        t('chat.draft.title', {
          name: presetName(t, draft.automationName ?? draft.automation),
          form: t(FORM_KEYS[draft.form] ?? FORM_KEYS.informal),
        })
      ),
      el('textarea', {
        key: 'text',
        rows: 4,
        value: draft.text,
        'aria-label': t('chat.draft.text'),
        onChange: (event) => drafts.edit(draft.id, event.target.value),
      }),
      el('div', { key: 'actions', className: 'row' }, [
        button('send', t('chat.draft.send')),
        button(
          'form',
          t('chat.draft.switchTo', { form: t(FORM_KEYS[other]) }),
          {
            form: other,
          }
        ),
        draft.prefill
          ? el(
              'a',
              {
                key: 'open',
                className: 'button',
                href: draft.prefill.url,
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              t(
                draft.prefill.prefillsText
                  ? 'chat.draft.openFilled'
                  : 'chat.draft.open'
              )
            )
          : null,
        button('mark', t('chat.draft.markSent')),
        button('skip', t('chat.draft.skip')),
      ]),
    ]
  );
};

const NOTICE = {
  queued: 'chat.notice.queued',
  nothing: 'chat.notice.nothing',
  'sent-auto': 'chat.notice.sentAuto',
  'draft-send': 'chat.notice.sent',
  'draft-mark': 'chat.notice.manual',
  'draft-skip': 'chat.notice.skipped',
  stored: 'chat.notice.stored',
  failed: 'chat.notice.failed',
};

const NEAR_BOTTOM_PX = 80;

// Follows the conversation like a messenger: to the end when the user is
// already there or just sent something; otherwise new messages wait
// below a "new messages" button instead of yanking the view away from
// what the user is reading.
const useFollow = (state) => {
  const box = useRef(null);
  const end = useRef(null);
  const near = useRef(true);
  const seen = useRef({ key: null, count: 0 });
  const [unseen, setUnseen] = useState(0);
  const count = state.messages.length;
  const last = state.messages.at(-1);
  const toEnd = () => {
    end.current?.scrollIntoView?.({ block: 'end' });
    near.current = true;
    setUnseen(0);
  };
  useEffect(() => {
    const before = seen.current;
    seen.current = { key: state.current?.key, count };
    const added =
      count - (before.key === state.current?.key ? before.count : 0);
    if (before.key !== state.current?.key || near.current) {
      toEnd();
    } else if (added > 0 && last?.sender === 'me' && last?.pending) {
      toEnd();
    } else if (added > 0) {
      setUnseen((n) => n + added);
    }
  }, [count, state.current?.key]);
  const onScroll = () => {
    const node = box.current;
    if (!node) {
      return;
    }
    near.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < NEAR_BOTTOM_PX;
    if (near.current) {
      setUnseen(0);
    }
  };
  return { box, end, unseen, onScroll, toEnd };
};

const Stream = ({ state }) => {
  const t = useT();
  const follow = useFollow(state);
  return el(
    'div',
    { className: 'chat-scroll', ref: follow.box, onScroll: follow.onScroll },
    [
      el('div', { key: 'col', className: 'chat-column' }, [
        ...state.messages.map((message) =>
          el(Message, {
            key: message.id,
            message,
            showName: !state.current.personal,
            composer: state.composer,
          })
        ),
        ...state.drafts.drafts.map((draft) =>
          el(DraftCard, { key: draft.id, draft, drafts: state.drafts })
        ),
        state.messages.length === 0
          ? el('p', { key: 'empty', className: 'meta' }, t('chat.empty'))
          : null,
        el('div', { key: 'end', ref: follow.end }),
      ]),
      follow.unseen > 0
        ? el(
            'button',
            {
              key: 'new',
              type: 'button',
              className: 'chat-new-pill',
              'data-action': 'scroll-new',
              onClick: follow.toEnd,
            },
            t('chat.newMessages', { count: follow.unseen })
          )
        : null,
    ]
  );
};

const Suggestions = ({ state }) => {
  const t = useT();
  const { suggestions = [], stage } = state.suggest;
  if (suggestions.length === 0) {
    return null;
  }
  return el(
    'div',
    {
      className: 'suggestions',
      'data-stage': stage,
      'aria-label': t(`chat.suggest.${stage}`),
    },
    suggestions.map((s) =>
      el(
        'button',
        {
          key: s.text,
          type: 'button',
          className: 'chip',
          title: t('chat.suggest.count', { count: s.count ?? 0 }),
          onClick: () => state.composer.setText(s.text),
        },
        s.text
      )
    )
  );
};

const Composer = ({ state }) => {
  const t = useT();
  const { composer } = state;
  const onKeyDown = (event) => {
    const first = state.suggest.suggestions?.[0];
    // Enter that confirms an input method's word (Chinese, Japanese…) is
    // not a Send.
    if (event.nativeEvent?.isComposing || event.keyCode === 229) {
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      composer.send();
    } else if (event.key === 'Tab' && first && !event.shiftKey) {
      event.preventDefault();
      composer.setText(first.text);
    }
  };
  return el(
    'form',
    {
      className: 'chat-composer',
      onSubmit: (event) => {
        event.preventDefault();
        composer.send();
      },
    },
    [
      el(Suggestions, { key: 's', state }),
      el('div', { key: 'row', className: 'chat-composer-row' }, [
        el('textarea', {
          key: 'input',
          rows: 1,
          placeholder: t('chat.placeholder'),
          'aria-label': t('chat.placeholder'),
          value: composer.text,
          onChange: (event) =>
            composer.setText(event.target.value, { typed: true }),
          onKeyDown,
        }),
        el(
          'button',
          {
            key: 'send',
            type: 'submit',
            className: 'primary send',
            disabled: !composer.text.trim(),
            'aria-busy': composer.sending ? 'true' : undefined,
            'aria-label': t('common.send'),
          },
          el(Icon, { name: 'send', size: 18 })
        ),
      ]),
    ]
  );
};

/** The screen itself, pure: everything comes from `state`. */
export const ChatScreen = ({ state }) => {
  const t = useT();
  const [pane, setPane] = useState('list');
  if (state.loading) {
    return el('div', { className: 'meta' }, t('common.loading'));
  }
  if (state.total === 0) {
    // Connected but nothing synced yet: say so, never "connect" again.
    return state.telegram?.connected
      ? el(ChatAccountEmpty, { telegram: state.telegram })
      : el(ConnectionGuide, { section: 'chat' });
  }
  // Phones show one pane at a time (list → conversation → back), as
  // Telegram and WhatsApp do; wider screens show both and ignore it.
  const select = (key) => {
    state.select(key);
    setPane('chat');
  };
  return el('div', { className: 'chat-shell', 'data-pane': pane }, [
    el(Sidebar, { key: 'side', state: { ...state, select } }),
    state.current
      ? el('section', { key: 'main', className: 'chat-main' }, [
          el(Header, { key: 'h', state, onBack: () => setPane('list') }),
          el(Notice, {
            key: 'n',
            notice: state.notice,
            labels: NOTICE,
            dismiss: state.dismiss,
          }),
          el(Stream, { key: 's', state }),
          el(Composer, { key: 'c', state }),
        ])
      : null,
  ]);
};

export const ChatView = ({ api = defaultApi, ...options }) => {
  const t = useT();
  return el(ChatScreen, { state: useChatState(api, { t, ...options }) });
};
