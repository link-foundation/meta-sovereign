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

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api as defaultApi } from './dom.js';
import { sentence, useDates, useT } from './i18n.js';
import { ConnectionGuide } from './connection-guide.js';
import { ChatAccountEmpty, ChatAccountLine } from './chat-account.js';
import { networkName } from './connection-guides.js';
import {
  CHAT_FILTERS,
  avatarFor,
  groupChats,
  networkMessageId,
} from './chat-model.js';
import { presetName } from './automations-model.js';
import { useChatState } from './chat-state.js';
import { Icon } from './icons.js';
import { Notice } from './notice.js';
import { useLeaving } from './chat-leaving.js';
import {
  MessageBubble,
  DeleteDialog,
  EditDialog,
  ForwardPicker,
  ReplyQuote,
} from './chat-message.js';
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
          chat.unread > 0
            ? el(
                'span',
                {
                  key: 'u',
                  className: 'chat-item-unread',
                  'data-unread': chat.unread,
                  'aria-label': t('chat.unread', { count: chat.unread }),
                },
                chat.unread > 999 ? '999+' : String(chat.unread)
              )
            : el(
                'span',
                { key: 's', className: 'chat-item-source' },
                networkName(t, chat.source)
              ),
        ]),
      ]),
    ]
  );
};

// All / Private / Groups / Channels — newest chat first under each.
const FilterTabs = ({ state }) => {
  const t = useT();
  if (typeof state.setFilter !== 'function') {
    return null;
  }
  return el(
    'div',
    {
      className: 'chat-filters',
      role: 'tablist',
      'aria-label': t('chat.filter.label'),
    },
    CHAT_FILTERS.map((filter) =>
      el(
        'button',
        {
          key: filter,
          type: 'button',
          role: 'tab',
          className:
            state.filter === filter ? 'chat-filter active' : 'chat-filter',
          'aria-selected': state.filter === filter ? 'true' : 'false',
          'data-filter': filter,
          onClick: () => state.setFilter(filter),
        },
        t(`chat.filter.${filter}`)
      )
    )
  );
};

// Chats that show in the list (or are one screen away) are prefetched;
// the list's end, one screen before it shows, reads its next page.
const useListLoading = (list, state) => {
  const { chats, prefetch, moreChats, query } = state;
  useEffect(() => {
    const Observer = globalThis.IntersectionObserver;
    const root = list.current;
    if (typeof Observer !== 'function' || !root) {
      return undefined;
    }
    const byKey = new Map(chats.map((chat) => [chat.key, chat]));
    const observer = new Observer(
      (entries) => {
        for (const entry of entries.filter((e) => e.isIntersecting)) {
          if (entry.target.dataset.more !== undefined) {
            moreChats?.more();
          } else {
            const chat = byKey.get(entry.target.dataset.chat);
            if (chat) {
              prefetch?.(chat);
            }
          }
        }
      },
      { root, rootMargin: '100% 0px' }
    );
    for (const node of root.querySelectorAll('[data-chat], [data-more]')) {
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [chats, prefetch, moreChats?.more, moreChats?.available, query]);
};

const Sidebar = ({ state }) => {
  const t = useT();
  const list = useRef(null);
  useListLoading(list, state);
  const moreRow =
    state.moreChats?.available && !state.query
      ? el(
          'p',
          { key: 'more', className: 'meta chat-list-more', 'data-more': '' },
          t('chat.loadingChats')
        )
      : null;
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
      el(FilterTabs, { key: 'f', state }),
    ]),
    el(
      'nav',
      {
        key: 'list',
        ref: list,
        className: 'chat-list',
        'aria-label': t('chat.aside'),
      },
      state.chats.length === 0
        ? [
            el('p', { key: 'none', className: 'meta' }, t('chat.noMatches')),
            moreRow,
          ]
        : [
            ...groupChats(state.chats).map(({ group, chats }) =>
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
            ),
            moreRow,
          ]
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
// out (only after a second, so a quick send never flashes it — Telegram
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
    case 'after-failure':
      return t('chat.failure.afterFailure');
    case 'network':
    case 'no-answer':
      return t('chat.failure.network');
    default:
      return t('chat.failure.other', {
        error: message.error ?? message.code ?? '',
      });
  }
};

/** A message that will be tried again by itself: why, and when. */
export const waitingText = (t, message, now = Date.now()) => {
  const seconds = Math.max(
    0,
    Math.ceil((Number(message.retryAt ?? 0) - now) / 1000)
  );
  if (message.code === 'flood-wait') {
    return t('chat.waiting.flood', { seconds });
  }
  if (globalThis.navigator?.onLine === false) {
    return t('chat.waiting.offline');
  }
  return t('chat.waiting.retry', { seconds });
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
  'action-failed': 'chat.notice.actionFailed',
};

const NEAR_BOTTOM_PX = 80;

// One message across its life: a queued one and the link it becomes
// share the `clientId`.
const identity = (message) => message?.clientId ?? message?.id ?? null;

/**
 * How many messages follow the one that was last (all when unknown).
 * When that one left (deleted), what follows the last of the messages
 * that were there before (`known`, their identities) is new.
 */
export const addedAfter = (messages, lastBefore, known = null) => {
  if (lastBefore === null || lastBefore === undefined) {
    return messages.length;
  }
  const at = messages.findIndex((m) => identity(m) === lastBefore);
  if (at >= 0) {
    return messages.length - 1 - at;
  }
  const kept = known
    ? messages.findLastIndex((m) => known.has(identity(m)))
    : -1;
  if (kept >= 0) {
    return messages.length - 1 - kept;
  }
  return identity(messages.at(-1)) === lastBefore ? 0 : 1;
};

/** What a change in the open chat does to the view. */
export const followMove = ({ opened, line, near, added, justSent }) => {
  if (line) {
    return 'line';
  }
  if (opened || near || (added > 0 && justSent)) {
    return 'end';
  }
  return added > 0 ? 'count' : null;
};

// Older messages are asked for while the top is closer than this many
// screens, so scrolling up never reaches a stretch that is not loaded.
const AHEAD_SCREENS = 2;

const useOlder = (box, state) => {
  const history = state.history;
  const check = () => {
    const node = box.current;
    if (!node || !history?.older || history.loading || history.failed) {
      return;
    }
    if (node.scrollTop < AHEAD_SCREENS * node.clientHeight) {
      history.loadOlder();
    }
  };
  useEffect(check, [
    state.messages.length,
    history?.older,
    history?.loading,
    state.current?.key,
  ]);
  return check;
};

// A page added above keeps what the user reads where it was: the
// distance to the bottom stays the same.
const useKeepPlace = (box, state) => {
  const fromBottom = useRef(0);
  const first = useRef({ key: null, id: null });
  useLayoutEffect(() => {
    const node = box.current;
    if (!node || typeof node.scrollHeight !== 'number') {
      return;
    }
    const key = state.current?.key ?? null;
    const id = state.messages[0]?.id ?? null;
    if (
      first.current.key === key &&
      first.current.id !== null &&
      first.current.id !== id &&
      node.scrollHeight > 0
    ) {
      node.scrollTop = node.scrollHeight - fromBottom.current;
    }
    first.current = { key, id };
    fromBottom.current = node.scrollHeight - node.scrollTop;
  });
  return () => {
    const node = box.current;
    if (node) {
      fromBottom.current = node.scrollHeight - node.scrollTop;
    }
  };
};

const OlderRow = ({ history }) => {
  const t = useT();
  if (!history?.older && !history?.loading) {
    return null;
  }
  return el(
    'div',
    {
      className: 'chat-older',
      role: 'status',
      'data-older': history.failed ? 'failed' : 'loading',
    },
    history.failed
      ? [
          el('span', { key: 't' }, t('chat.earlierFailed')),
          el(
            'button',
            {
              key: 'r',
              type: 'button',
              'data-action': 'load-older',
              onClick: () => history.loadOlder(),
            },
            t('chat.failure.retry')
          ),
        ]
      : t('chat.loadingEarlier')
  );
};

// Follows the conversation like a messenger: a chat opens at its first
// unread message (or at the end), then follows to the end when the user
// is already there or just sent something; otherwise new messages wait
// below a "new messages" button instead of yanking the view away from
// what the user is reading.
const useFollow = (state) => {
  const box = useRef(null);
  const end = useRef(null);
  const line = useRef(null);
  const near = useRef(true);
  const seen = useRef({ key: null, last: null, known: null });
  const waitLine = useRef(false);
  const [unseen, setUnseen] = useState(0);
  const count = state.messages.length;
  const last = state.messages.at(-1);
  const lastId = identity(last);
  // To the very bottom, past the padding the floating composer covers
  // (`scrollIntoView` on the last bubble would leave it underneath).
  const bottom = () => {
    const node = box.current;
    if (node && typeof node.scrollHeight === 'number') {
      node.scrollTop = node.scrollHeight;
    } else {
      end.current?.scrollIntoView?.({ block: 'end' });
    }
  };
  const toEnd = () => {
    bottom();
    near.current = true;
    setUnseen(0);
  };
  const toLine = () => {
    line.current.scrollIntoView?.({ block: 'start' });
    near.current = false;
    setUnseen(0);
  };
  useEffect(() => {
    const key = state.current?.key;
    const before = seen.current;
    seen.current = {
      key,
      last: lastId,
      known: new Set(state.messages.map(identity)),
    };
    const opened = before.key !== key;
    // Older pages come in above: only what follows the last one is new.
    const added = opened
      ? count
      : addedAfter(state.messages, before.last, before.known);
    const justSent = last?.sender === 'me' && Boolean(last?.pending);
    // The unread line may come with the chat's first page, just after.
    const lineWanted = opened || waitLine.current;
    waitLine.current = opened && !line.current;
    const move = followMove({
      opened,
      line: lineWanted && Boolean(line.current),
      near: near.current,
      added,
      justSent,
    });
    if (move === 'line') {
      toLine();
    } else if (move === 'end') {
      toEnd();
    } else if (move === 'count') {
      setUnseen((n) => n + added);
    }
  }, [count, lastId, state.current?.key]);
  // A bubble that grows (a failure's actions, a late link preview) keeps
  // the end in view when the user was there.
  useEffect(() => {
    const Observer = globalThis.ResizeObserver;
    const column = end.current?.parentElement;
    if (typeof Observer !== 'function' || !column) {
      return undefined;
    }
    const observer = new Observer(() => {
      if (near.current) {
        bottom();
      }
    });
    observer.observe(column);
    return () => observer.disconnect();
  }, []);
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
  return { box, end, line, unseen, onScroll, toEnd };
};

// Tells `seen(id)` the newest incoming message that is on screen (at
// least half of it), so reading marks the chat read only that far.
const useSeen = (box, seen, messages) => {
  useEffect(() => {
    const Observer = globalThis.IntersectionObserver;
    const root = box.current;
    if (typeof Observer !== 'function' || !root || !seen) {
      return undefined;
    }
    const observer = new Observer(
      (entries) => {
        const ids = entries
          .filter((e) => e.isIntersecting)
          .map((e) => Number(e.target.dataset.seenId))
          .filter(Number.isFinite);
        if (ids.length > 0) {
          seen(Math.max(...ids));
        }
      },
      { root, threshold: 0.5 }
    );
    for (const node of root.querySelectorAll('[data-seen-id]')) {
      observer.observe(node);
    }
    return () => observer.disconnect();
  }, [box, seen, messages]);
};

const UnreadLine = ({ lineRef }) => {
  const t = useT();
  return el(
    'div',
    { ref: lineRef, className: 'chat-unread-line', role: 'separator' },
    el('span', null, t('chat.unreadLine'))
  );
};

// Who spoke last — used to show avatar/name only on first in a run.
const runFlags = (messages) => {
  const flags = new Map();
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const prev = messages[i - 1];
    const isFirst =
      !prev || prev.sender !== m.sender || m.service || prev.service;
    flags.set(m.id, isFirst);
  }
  return flags;
};

const Stream = ({ state, api, onAction }) => {
  const t = useT();
  const follow = useFollow(state);
  const keep = useKeepPlace(follow.box, state);
  const older = useOlder(follow.box, state);
  useSeen(follow.box, state.seen, state.messages);
  const onScroll = () => {
    follow.onScroll();
    keep();
    older();
  };
  // What leaves the chat goes like in Telegram (./chat-leaving.js).
  const messages = useLeaving(state.messages, state.current?.key ?? null);
  // Map for reply lookups.
  const msgById = new Map(messages.map((m) => [m.id, m]));
  const firstInRun = runFlags(messages);
  // Scroll to a message by its link id.
  const onScrollTo = (id) => {
    const node = follow.box.current?.querySelector(
      `[data-message="${globalThis.CSS?.escape(id) ?? String(id)}"]`
    );
    node?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };
  return el('div', { className: 'chat-scroll', ref: follow.box, onScroll }, [
    el('div', { key: 'col', className: 'chat-column' }, [
      el(OlderRow, { key: 'older', history: state.history }),
      ...messages.flatMap((message) => [
        message.id === state.unreadLine
          ? el(UnreadLine, { key: 'unread-line', lineRef: follow.line })
          : null,
        el(MessageBubble, {
          key: message.id,
          message,
          showAvatar: firstInRun.get(message.id) !== false,
          showName:
            !state.current.personal && firstInRun.get(message.id) !== false,
          isPersonal: Boolean(state.current.personal),
          msgById,
          composer: state.composer,
          api,
          onScrollTo,
          onAction,
        }),
      ]),
      ...state.drafts.drafts.map((draft) =>
        el(DraftCard, { key: draft.id, draft, drafts: state.drafts })
      ),
      messages.length === 0
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

// Several messages not sent: deal with them at once (Element's bar).
const FailedBar = ({ composer }) => {
  const t = useT();
  if (composer.failed < 2) {
    return null;
  }
  return el('div', { className: 'chat-failed-bar', role: 'alert' }, [
    el('span', { key: 'n' }, t('chat.failedCount', { count: composer.failed })),
    el(
      'button',
      {
        key: 'resend',
        type: 'button',
        'data-action': 'resend-all',
        onClick: composer.resendAll,
      },
      t('chat.resendAll')
    ),
    el(
      'button',
      {
        key: 'delete',
        type: 'button',
        'data-action': 'delete-all',
        onClick: composer.deleteAll,
      },
      t('chat.deleteAll')
    ),
  ]);
};

/** No network, the local server restarting, Telegram reconnecting. */
const ConnectionBanner = ({ banner }) => {
  const t = useT();
  return banner
    ? el(
        'div',
        {
          className: 'chat-banner',
          role: 'status',
          'data-banner': banner,
        },
        t(`chat.banner.${banner}`)
      )
    : null;
};

// Reply bar shown above the input when user chose to reply.
const ReplyBar = ({ replyTo, onClear }) => {
  const t = useT();
  if (!replyTo) {
    return null;
  }
  return el('div', { className: 'composer-reply-bar' }, [
    el(ReplyQuote, { key: 'q', replyRef: replyTo }),
    el(
      'button',
      {
        key: 'x',
        type: 'button',
        className: 'composer-reply-clear',
        'aria-label': t('chat.replyCancel'),
        onClick: onClear,
      },
      '✕'
    ),
  ]);
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
      el(ReplyBar, {
        key: 'rb',
        replyTo: composer.replyTo ?? null,
        onClear: composer.clearReplyTo,
      }),
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

// Pinned message bar shown when the newest loaded pinned message is known.
const PinnedBar = ({ messages }) => {
  const t = useT();
  if (!messages?.length) {
    return null;
  }
  const pinned = messages.find((m) => m.raw?.pinned);
  if (!pinned) {
    return null;
  }
  const text = pinned.body || t('chat.pinnedMessage');
  return el('div', { className: 'chat-pinned-bar', role: 'status' }, [
    el(
      'span',
      { key: 'icon', className: 'chat-pinned-icon', 'aria-hidden': 'true' },
      '📌'
    ),
    el(
      'span',
      { key: 'txt', className: 'chat-pinned-text' },
      text.length > 80 ? `${text.slice(0, 80)}…` : text
    ),
  ]);
};

/** The screen itself, pure: everything comes from `state`. */
export const ChatScreen = ({ state, api }) => {
  const t = useT();
  const [pane, setPane] = useState('list');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [forwardTarget, setForwardTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
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

  // Other networks' messages go through /api/message/* (R-Y38): the
  // network's API first, its web app second. A refusal is shown.
  const generic = async (action, message, body) => {
    if (typeof api?.messageAction !== 'function') {
      return;
    }
    const answer = await api.messageAction(action, {
      ids: [message.id],
      ...body,
    });
    if (answer?.error) {
      state.notify?.({ kind: 'action-failed', error: answer.error });
    }
  };

  const onAction = (action, message, value) => {
    if (action === 'reply') {
      const netId = networkMessageId(message);
      state.composer.setReplyTo({
        msgId: netId,
        linkId: message.id,
        senderName: message.senderName ?? message.sender,
        text: message.body ?? '',
      });
    } else if (action === 'copy' && message.body) {
      globalThis.navigator?.clipboard?.writeText(message.body).catch(() => {});
    } else if (action === 'forward') {
      setForwardTarget(message);
    } else if (action === 'delete') {
      setDeleteTarget(message);
    } else if (action === 'edit') {
      setEditTarget(message);
    } else if (action === 'react' && !message.pending) {
      generic('react', message, { emoji: value });
    }
  };

  const viaTelegram = (message) =>
    message.source === 'telegram' && networkMessageId(message) !== null;

  const doDelete = async (message, { revoke }) => {
    if (message.pending || !state.current) {
      return;
    }
    if (!viaTelegram(message)) {
      await generic('delete', message, { revoke });
      return;
    }
    const netId = networkMessageId(message);
    if (typeof api?.telegramDelete !== 'function') {
      return;
    }
    await api.telegramDelete({
      chat: state.current.chat,
      ids: [netId],
      revoke,
    });
  };

  const doForward = async (message, toChat) => {
    if (message.pending || !state.current) {
      return;
    }
    if (!viaTelegram(message)) {
      await generic('forward', message, {
        toChat: toChat.chat,
        toTitle: toChat.name,
      });
      setForwardTarget(null);
      return;
    }
    const netId = networkMessageId(message);
    if (typeof api?.telegramForward !== 'function') {
      return;
    }
    await api.telegramForward({
      fromChat: state.current.chat,
      ids: [netId],
      toChat: toChat.chat,
    });
    setForwardTarget(null);
  };

  return el('div', { className: 'chat-shell', 'data-pane': pane }, [
    el(Sidebar, { key: 'side', state: { ...state, select } }),
    state.current
      ? el('section', { key: 'main', className: 'chat-main' }, [
          el(Header, { key: 'h', state, onBack: () => setPane('list') }),
          el(PinnedBar, { key: 'pin', messages: state.messages }),
          el(ConnectionBanner, { key: 'b', banner: state.banner }),
          el(FailedBar, { key: 'failed', composer: state.composer }),
          el(Notice, {
            key: 'n',
            notice: state.notice,
            labels: NOTICE,
            dismiss: state.dismiss,
          }),
          el(Stream, { key: 's', state, api, onAction }),
          el(Composer, { key: 'c', state }),
          deleteTarget
            ? el(DeleteDialog, {
                key: 'del',
                message: deleteTarget,
                isGroup: !state.current.personal,
                onClose: () => setDeleteTarget(null),
                onDelete: (opts) => {
                  doDelete(deleteTarget, opts);
                  setDeleteTarget(null);
                },
              })
            : null,
          editTarget
            ? el(EditDialog, {
                key: 'edit',
                message: editTarget,
                onClose: () => setEditTarget(null),
                onSave: (text) => generic('edit', editTarget, { text }),
              })
            : null,
          forwardTarget
            ? el(ForwardPicker, {
                key: 'fwd',
                // A message forwards within its own network.
                chats: state.chats.filter(
                  (c) => c.source === state.current.source
                ),
                onClose: () => setForwardTarget(null),
                onForward: (toChat) => doForward(forwardTarget, toChat),
              })
            : null,
        ])
      : null,
  ]);
};

export const ChatView = ({ api = defaultApi, ...options }) => {
  const t = useT();
  return el(ChatScreen, { state: useChatState(api, { t, ...options }), api });
};
