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
import { sentence, useDates, useLocaleContext, useT } from './i18n.js';
import { ConnectionGuide } from './connection-guide.js';
import { ChatAccountEmpty, ChatAccountLine } from './chat-account.js';
import { networkName } from './connection-guides.js';
import { CHAT_FILTERS, CHAT_SORTS, groupChats } from './chat-model.js';
import { presetName } from './automations-model.js';
import { useChatState } from './chat-state.js';
import { Icon } from './icons.js';
import { Notice } from './notice.js';
import { useLeaving } from './chat-leaving.js';
import { infoLine } from './chat-info.js';
import { PersonPanel } from './person-panel.js';
import { UnreadMarks, useUnreadMarks } from './chat-marks.js';
import {
  MessageBubble,
  QuoteContext,
  ReplyQuote,
  mediaLabel,
} from './chat-message.js';
import { parseMessageParts } from './message-parts.js';
import { ArchiveHead, ArchiveItem, ChatAvatar, ChatItem } from './chat-list.js';
import { useChatActions } from './chat-actions.js';
import { SelectionTop } from './chat-selection.js';
import { useDragSelect } from './chat-drag.js';
import { Busy, ChatListSkeleton, Spinner } from './spinner.js';
import { useComposerText, useSuggestionsFor } from './chat-suggest.js';
export { reasonText } from './notice.js';

const el = React.createElement;

// Newest first (the default) or oldest first, by each chat's latest
// message; remembered in this browser.
const SortChoice = ({ state }) => {
  const t = useT();
  if (typeof state.setSort !== 'function') {
    return null;
  }
  return el(
    'select',
    {
      className: 'chat-sort',
      'aria-label': t('chat.sort.label'),
      title: t('chat.sort.label'),
      value: state.sort ?? 'latest',
      onChange: (event) => state.setSort(event.target.value),
    },
    CHAT_SORTS.map((order) =>
      el('option', { key: order, value: order }, t(`chat.sort.${order}`))
    )
  );
};

// All / Private / Groups / Channels — in the list's order under each.
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
const useListLoading = (list, state, shown) => {
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
  }, [chats, prefetch, moreChats?.more, moreChats?.available, query, shown]);
};

// The list grows a page at a time as it is scrolled (R-Y71): thousands
// of rows at once keep the browser busy for a long moment, and only a
// screenful shows. The row past the last one shown asks for the next.
const LIST_PAGE = 60;

const useShownChats = (list, state) => {
  const [shown, setShown] = useState(LIST_PAGE);
  const { query, filter, folder, sort } = state;
  useEffect(() => setShown(LIST_PAGE), [query, filter, folder, sort]);
  const more = shown < state.chats.length;
  useEffect(() => {
    const Observer = globalThis.IntersectionObserver;
    const row = list.current?.querySelector('[data-grow]');
    if (typeof Observer !== 'function' || !row) {
      return undefined;
    }
    const observer = new Observer(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown((n) => n + LIST_PAGE);
        }
      },
      { root: list.current, rootMargin: '100% 0px' }
    );
    observer.observe(row);
    return () => observer.disconnect();
  }, [shown, more]);
  return { chats: more ? state.chats.slice(0, shown) : state.chats, more };
};

// The row after the last: the next page of those held, else the next
// page from the server (while it says it has more).
const listEnd = (t, state, more) => {
  if (more) {
    return el('div', {
      key: 'grow',
      className: 'chat-list-grow',
      'data-grow': '',
    });
  }
  return state.moreChats?.available && !state.query
    ? el(
        'p',
        {
          key: 'more',
          className: 'meta chat-list-more',
          'data-more': '',
          role: 'status',
        },
        [
          el(Spinner, { key: 's' }),
          el(
            'span',
            { key: 't', className: 'sr-only' },
            t('chat.loadingChats')
          ),
        ]
      )
    : null;
};

// A row re-renders only when its chat, or whether it is open, changes.
const ChatRow = React.memo(ChatItem);

const Sidebar = ({ state, api }) => {
  const t = useT();
  const list = useRef(null);
  const page = useShownChats(list, state);
  useListLoading(list, state, page.chats.length);
  const oldest = state.sort === 'oldest';
  const item = (chat) =>
    el(ChatRow, {
      key: chat.key,
      api,
      chat,
      active: chat.key === state.current?.key,
      onSelect: state.select,
    });
  const archived = state.folder === 'archive' && !state.query;
  const archiveRow =
    !archived && !state.query && state.archive?.count > 0
      ? el(ArchiveItem, {
          key: 'archive',
          archive: state.archive,
          onOpen: () => state.setFolder('archive'),
        })
      : null;
  const moreRow = listEnd(t, state, page.more);
  return el('aside', { className: 'chat-sidebar' }, [
    el('div', { key: 'h', className: 'chat-sidebar-head' }, [
      el('div', { key: 'top', className: 'chat-sidebar-top' }, [
        el(
          'span',
          { key: 't', className: 'chat-sidebar-title' },
          t('chat.aside')
        ),
        el(SortChoice, { key: 's', state }),
      ]),
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
      [
        archived
          ? el(ArchiveHead, {
              key: 'arch',
              onBack: () => state.setFolder('main'),
            })
          : null,
        archiveRow,
        ...(state.chats.length === 0
          ? [
              el('p', { key: 'none', className: 'meta' }, t('chat.noMatches')),
              moreRow,
            ]
          : [
              // Oldest first needs every chat: the next page is read at once.
              oldest ? moreRow : null,
              ...(oldest
                ? groupChats(page.chats, Date.now(), state.sort).map(
                    ({ group, chats }) =>
                      el('section', { key: group, className: 'chat-group' }, [
                        el('h3', { key: 'h' }, t(`chat.group.${group}`)),
                        ...chats.map(item),
                      ])
                  )
                : // Telegram's own order: the pinned, then the newest.
                  page.chats.map(item)),
              oldest ? null : moreRow,
            ]),
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

// Under the name: who is typing, else Telegram's members and online, a
// person's last seen, else the network and how many wrote here.
const subtitleOf = (t, state, chatTime) => {
  const chat = state.current;
  const line = infoLine(t, state.info, { kind: chat.kind, chatTime });
  const source = networkName(t, chat.source);
  if (line) {
    return line;
  }
  // A group whose members are not known yet says only where it is.
  if (!chat.personal && chat.people.length === 0) {
    return source;
  }
  return t(chat.personal ? 'chat.subtitle.personal' : 'chat.subtitle.group', {
    source,
    count: chat.people.length,
  });
};

// Who this is: what the conversation tells about them (R-Y50).
const AboutButton = ({ about, onAbout }) => {
  const t = useT();
  return el(
    'button',
    {
      type: 'button',
      className: about ? 'chat-about icon-btn active' : 'chat-about icon-btn',
      'data-action': 'chat-about',
      'aria-label': t('chat.about.open'),
      'aria-pressed': about,
      title: t('chat.about.open'),
      onClick: onAbout,
    },
    el(Icon, { name: 'user' })
  );
};

const Header = ({ state, api, onBack, about, onAbout }) => {
  const t = useT();
  const { chatTime } = useDates();
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
    el(ChatAvatar, { key: 'a', api, chat }),
    el('div', { key: 't', className: 'chat-header-title' }, [
      el('strong', { key: 'n' }, chat.name),
      el(
        'span',
        {
          key: 's',
          className:
            state.info?.online && state.info.kind === 'user'
              ? 'meta online'
              : 'meta',
        },
        isTyping(state.typing)
          ? el(TypingLine, { typing: state.typing })
          : subtitleOf(t, state, chatTime)
      ),
    ]),
    chat.personal ? el(AboutButton, { key: 'about', about, onAbout }) : null,
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
  copied: 'chat.notice.copied',
  'link-copied': 'chat.notice.linkCopied',
  'image-copied': 'chat.notice.imageCopied',
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
    if (
      !node ||
      !history?.older ||
      history.loading ||
      history.failed ||
      history.stalled
    ) {
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
    history?.stalled,
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
      : [
          // Telegram shows the arc alone above the messages.
          el(Spinner, { key: 's' }),
          el(
            'span',
            { key: 't', className: 'sr-only' },
            t('chat.loadingEarlier')
          ),
        ]
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
  const [away, setAway] = useState(false);
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
    const below = node.scrollHeight - node.scrollTop - node.clientHeight;
    near.current = below < NEAR_BOTTOM_PX;
    // Telegram offers the way down once a screen is above the end.
    setAway(below > node.clientHeight / 2);
    if (near.current) {
      setUnseen(0);
    }
  };
  return { box, end, line, unseen, away, onScroll, toEnd };
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

// Telegram groups one sender's messages into a run when they follow
// each other within 10 minutes on the same day (telegram-tt
// `groupMessages`): the name shows on the first, the avatar by the
// last, and the bubbles' corners between them are rounded less.
const RUN_GAP_MS = 10 * 60_000;

const sameRun = (a, b) =>
  Boolean(a && b) &&
  !a.service &&
  !b.service &&
  String(a.sender) === String(b.sender) &&
  Math.abs(Date.parse(b.timestamp) - Date.parse(a.timestamp)) <= RUN_GAP_MS &&
  String(a.timestamp).slice(0, 10) === String(b.timestamp).slice(0, 10);

/** id → { first, last } of each message in its sender's run. */
export const messageRuns = (messages) => {
  const runs = new Map();
  for (let i = 0; i < messages.length; i += 1) {
    runs.set(messages[i].id, {
      first: !sameRun(messages[i - 1], messages[i]),
      last: !sameRun(messages[i], messages[i + 1]),
    });
  }
  return runs;
};

const Stream = ({ state, api, actions }) => {
  const { onAction, menuFor, selection } = actions;
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
  // Reply lookups: what is shown, then the originals fetched for it.
  const shownById = new Map(messages.map((m) => [m.id, m]));
  const msgById = {
    get: (id) => shownById.get(id) ?? state.replyTargets?.get(id),
  };
  const runs = messageRuns(messages);
  const order = messages.filter((m) => !m.service).map((m) => m.id);
  const onSelect = (id, { shift }) => selection.toggle(id, { shift, order });
  const column = useRef(null);
  const drag = useDragSelect({
    box: follow.box,
    column,
    selection,
    order: () => order,
  });
  const marks = useUnreadMarks(api, state.current, {
    reach: state.history?.reach,
    scrollTo: (id) => onScrollTo(id),
  });
  const alone =
    Boolean(state.current.personal) || state.current.kind === 'channel';
  // Scroll to a message by its link id.
  const onScrollTo = (id) => {
    const node = follow.box.current?.querySelector(
      `[data-message="${globalThis.CSS?.escape(id) ?? String(id)}"]`
    );
    node?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };
  const scroll = el(
    'div',
    {
      key: 'scroll',
      className: 'chat-scroll',
      ref: follow.box,
      onScroll,
      // Beside the column and between rows too, as in Desktop.
      onMouseDown: drag.onMouseDown,
      onClick: drag.onClick,
    },
    [
      el(
        'div',
        {
          key: 'col',
          ref: column,
          className: selection.active
            ? 'chat-column is-selecting'
            : 'chat-column',
        },
        [
          el(OlderRow, { key: 'older', history: state.history }),
          ...messages.flatMap((message) => [
            message.id === state.unreadLine
              ? el(UnreadLine, { key: 'unread-line', lineRef: follow.line })
              : null,
            el(MessageBubble, {
              key: message.id,
              message,
              run: runs.get(message.id),
              showAvatar: runs.get(message.id)?.last !== false,
              showName: !alone && runs.get(message.id)?.first !== false,
              // A private chat and a channel name no one: there is one voice.
              isPersonal: alone,
              msgById,
              composer: state.composer,
              api,
              onScrollTo,
              onAction,
              menuFor,
              selecting: selection.active,
              selected: selection.shows(message.id),
              onSelect,
              // Desktop's corner Reply shows in groups only.
              fastReply: !alone,
            }),
          ]),
          ...state.drafts.drafts.map((draft) =>
            el(DraftCard, { key: draft.id, draft, drafts: state.drafts })
          ),
          messages.length === 0
            ? el('p', { key: 'empty', className: 'meta' }, t('chat.empty'))
            : null,
          el('div', { key: 'end', ref: follow.end }),
        ]
      ),
    ]
  );
  const down = follow.away || follow.unseen > 0;
  return [
    scroll,
    el(UnreadMarks, {
      key: 'marks',
      current: state.current,
      marks,
      raised: down,
    }),
    el(ScrollDown, {
      key: 'down',
      shown: down,
      count: follow.unseen || (state.current.unread ?? 0),
      onClick: follow.toEnd,
    }),
  ];
};

// Telegram's round "down" button: shown once the end is out of sight,
// with how many messages wait below.
const ScrollDown = ({ shown, count, onClick }) => {
  const t = useT();
  if (!shown) {
    return null;
  }
  return el(
    'button',
    {
      type: 'button',
      className: 'chat-down',
      'data-action': 'scroll-new',
      'aria-label':
        count > 0
          ? `${t('chat.scrollDown')}: ${t('chat.newMessages', { count })}`
          : t('chat.scrollDown'),
      title: t('chat.scrollDown'),
      onClick,
    },
    [
      el(Icon, { key: 'i', name: 'arrow-down', size: 22 }),
      count > 0
        ? el(
            'span',
            { key: 'n', className: 'chat-down-count' },
            count > 999 ? '999+' : String(count)
          )
        : null,
    ]
  );
};

const Suggestions = ({ suggest, composer }) => {
  const t = useT();
  const { suggestions = [], stage } = suggest;
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
          onClick: () => composer.setText(s.text),
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

// The chat screen before its chats come: the list's rows as shimmering
// shapes, as Telegram Web A draws them, and the conversation's side
// empty (R-Y84).
const ChatLoading = ({ t }) =>
  el('div', { className: 'chat-shell is-loading' }, [
    el('aside', { key: 'side', className: 'chat-sidebar' }, [
      el(
        'div',
        { key: 'h', className: 'chat-sidebar-head' },
        el(
          Busy,
          { as: 'span', className: 'chat-sidebar-title' },
          t('common.loading')
        )
      ),
      el(ChatListSkeleton, { key: 'rows' }),
    ]),
    el('section', { key: 'main', className: 'chat-main' }),
  ]);

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
        [
          el(Spinner, { key: 's' }),
          el('span', { key: 't' }, t(`chat.banner.${banner}`)),
        ]
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

const Composer = ({ state, keys }) => {
  const t = useT();
  const { composer } = state;
  const text = useComposerText(composer);
  const suggest = useSuggestionsFor(state.suggester, text, state.suggest);
  const onKeyDown = (event) => {
    keys?.(event);
    if (event.defaultPrevented) {
      return;
    }
    const first = suggest.suggestions?.[0];
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
      el(Suggestions, { key: 's', suggest, composer }),
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
          value: text,
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
            disabled: !text.trim(),
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
// The chat's pinned message above the stream, as in Telegram: an
// accent bar, "Pinned message" and one line of it; a click goes to it.
// Bring a shown message to the middle of the stream.
const scrollToMessage = (id) =>
  globalThis.document
    ?.querySelector(
      `.chat-scroll [data-message="${globalThis.CSS?.escape(id) ?? id}"]`
    )
    ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });

const PinnedBar = ({ pinned, onOpen }) => {
  const t = useT();
  if (!pinned) {
    return null;
  }
  const { text, media } = parseMessageParts(pinned);
  const line = text || mediaLabel(t, media);
  return el(
    'button',
    {
      type: 'button',
      className: 'chat-pinned-bar',
      onClick: () => onOpen(pinned.id),
    },
    [
      el('span', {
        key: 'bar',
        className: 'chat-pinned-line',
        'aria-hidden': 'true',
      }),
      el('span', { key: 'b', className: 'chat-pinned-body' }, [
        el(
          'span',
          { key: 'h', className: 'chat-pinned-title' },
          t('chat.pinnedMessage')
        ),
        el(
          'span',
          { key: 'x', className: 'chat-pinned-text' },
          line.length > 120 ? `${line.slice(0, 120)}…` : line
        ),
      ]),
      el(Icon, { key: 'i', name: 'pin', size: 18 }),
    ]
  );
};

/** The screen itself, pure: everything comes from `state`. */
// The header, and beside the messages what the conversation tells about
// the person, open until closed (in every personal chat, as Telegram's
// profile column).
const ChatTop = ({ state, api, onBack }) => {
  const [about, setAbout] = useState(false);
  const chat = about && state.current?.personal ? state.current : null;
  return [
    el(Header, {
      key: 'h',
      state,
      api,
      onBack,
      about: Boolean(chat),
      onAbout: () => setAbout((open) => !open),
    }),
    chat
      ? el(PersonPanel, {
          key: `about:${chat.key}`,
          api,
          chat,
          onClose: () => setAbout(false),
        })
      : null,
  ];
};

export const ChatScreen = ({ state, api }) => {
  const { t, locale } = useLocaleContext();
  const [pane, setPane] = useState('list');
  const account = state.telegram?.account;
  const selfName =
    [account?.firstName, account?.lastName].filter(Boolean).join(' ') || null;
  const actions = useChatActions({ state, api, t, locale, selfName });
  // Phones show one pane at a time (list → conversation → back), as
  // Telegram and WhatsApp do; wider screens show both and ignore it.
  // One function for every render, so the list's rows stay as they are.
  const latest = useRef(null);
  latest.current = (key) => {
    state.select(key);
    setPane('chat');
  };
  const [select] = useState(() => (key) => latest.current(key));
  if (state.loading) {
    return el(ChatLoading, { t });
  }
  if (state.total === 0) {
    // Connected but nothing synced yet: say so, never "connect" again.
    return state.telegram?.connected
      ? el(ChatAccountEmpty, { telegram: state.telegram })
      : el(ConnectionGuide, { section: 'chat' });
  }
  const quote = { selfName, api };

  return el(
    QuoteContext.Provider,
    { value: quote },
    el('div', { className: 'chat-shell', 'data-pane': pane }, [
      el(Sidebar, { key: 'side', state: { ...state, select }, api }),
      state.current
        ? el('section', { key: 'main', className: 'chat-main' }, [
            // While messages are selected Desktop's top bar shows what
            // can be done with them; the composer stays.
            actions.selection.ids.length > 0
              ? el(SelectionTop, { key: 'h', ...actions.top })
              : el(ChatTop, {
                  key: 'h',
                  state,
                  api,
                  onBack: () => setPane('list'),
                }),
            el(PinnedBar, {
              key: 'pin',
              pinned: state.pinned,
              onOpen: scrollToMessage,
            }),
            el(ConnectionBanner, { key: 'b', banner: state.banner }),
            el(FailedBar, { key: 'failed', composer: state.composer }),
            el(Notice, {
              key: 'n',
              notice: state.notice,
              labels: NOTICE,
              dismiss: state.dismiss,
            }),
            el(Stream, { key: 's', state, api, actions }),
            el(Composer, { key: 'c', state, keys: actions.keys }),
            ...actions.dialogs,
          ])
        : null,
    ])
  );
};

export const ChatView = ({ api = defaultApi, ...options }) => {
  const t = useT();
  return el(ChatScreen, { state: useChatState(api, { t, ...options }), api });
};
