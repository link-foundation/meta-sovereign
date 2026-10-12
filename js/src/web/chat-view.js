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
import { useDates, useT } from './i18n.js';
import { ConnectionGuide } from './connection-guide.js';
import { avatarFor, groupChats } from './chat-model.js';
import { presetName } from './automations-model.js';
import { useChatState } from './chat-state.js';
import { Icon } from './icons.js';

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
  const { time } = useDates();
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
            time(chat.last.at)
          ),
        ]),
        el('span', { key: 'bottom', className: 'chat-item-bottom' }, [
          el(
            'span',
            { key: 'p', className: 'chat-item-preview' },
            `${chat.last.mine ? `${t('chat.you')}: ` : ''}${chat.last.body}`
          ),
          el('span', { key: 's', className: 'chat-item-source' }, chat.source),
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
                      t(`automations.mode.${a.mode}`)
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
                source: chat.source,
                count: chat.people.length,
              }
            )
      ),
    ]),
    el(AutomationMenu, { key: 'm', menu: state.menu }),
  ]);
};

const Message = ({ message, showName }) => {
  const { time } = useDates();
  return el(
    'div',
    {
      className: message.sender === 'me' ? 'bubble out' : 'bubble in',
      'data-message': message.id,
    },
    [
      showName && message.sender !== 'me'
        ? el(
            'span',
            { key: 'who', className: 'bubble-name' },
            message.senderName ?? message.sender
          )
        : null,
      el('span', { key: 'body', className: 'bubble-body' }, message.body ?? ''),
      el(
        'span',
        { key: 'time', className: 'bubble-time' },
        `${time(message.timestamp)}${message.via === 'browser' ? ' · web' : ''}`
      ),
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

/** Why a run queued nothing for this chat, in words when we have them. */
export const reasonText = (t, reason) => {
  if (!reason) {
    return t('automations.reason.none');
  }
  const key = `automations.reason.${reason}`;
  const text = t(key);
  return text === key ? reason : text;
};

const Notice = ({ notice, dismiss }) => {
  const t = useT();
  if (!notice) {
    return null;
  }
  return el(
    'div',
    {
      className: `chat-notice ${notice.kind}`,
      role: notice.kind === 'failed' ? 'alert' : 'status',
      'data-notice': notice.kind,
    },
    [
      el(
        'span',
        { key: 'text' },
        t(NOTICE[notice.kind] ?? NOTICE.failed, {
          count: notice.count ?? 0,
          error: notice.error ?? '',
          reason: reasonText(t, notice.reason),
        })
      ),
      el(
        'button',
        {
          key: 'x',
          type: 'button',
          className: 'icon-btn',
          'aria-label': t('chat.notice.dismiss'),
          title: t('chat.notice.dismiss'),
          onClick: dismiss,
        },
        el(Icon, { name: 'close', size: 16 })
      ),
    ]
  );
};

const Stream = ({ state }) => {
  const t = useT();
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [state.messages.length, state.current?.key]);
  return el('div', { className: 'chat-scroll' }, [
    el('div', { key: 'col', className: 'chat-column' }, [
      ...state.messages.map((message) =>
        el(Message, {
          key: message.id,
          message,
          showName: !state.current.personal,
        })
      ),
      ...state.drafts.drafts.map((draft) =>
        el(DraftCard, { key: draft.id, draft, drafts: state.drafts })
      ),
      state.messages.length === 0
        ? el('p', { key: 'empty', className: 'meta' }, t('chat.empty'))
        : null,
      el('div', { key: 'end', ref: end }),
    ]),
  ]);
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
          onChange: (event) => composer.setText(event.target.value),
          onKeyDown,
        }),
        el(
          'button',
          {
            key: 'send',
            type: 'submit',
            className: 'primary send',
            disabled: !composer.text.trim(),
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
    return el(ConnectionGuide, { section: 'chat' });
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
