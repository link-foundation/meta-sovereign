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

import { PeerBar } from './chat-peer-actions.js';
import { TtlBadge } from './chat-ttl.js';
import { SavedChats, SavedToggle, useSavedView } from './chat-saved.js';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { api as defaultApi } from './dom.js';
import { sentence, useDates, useLocaleContext, useT } from './i18n.js';
import { ConnectionGuide } from './connection-guide.js';
import { ChatAccountEmpty } from './chat-account.js';
import { networkName } from './connection-guides.js';
import { networkMessageId } from './chat-model.js';
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
import { ChatAvatar } from './chat-list.js';
import { replyRefOf, useChatActions } from './chat-actions.js';
import { SelectionTop } from './chat-selection.js';
import { useDragSelect } from './chat-drag.js';
import { Busy, ChatListSkeleton, Spinner } from './spinner.js';
import { useComposerText, useSuggestionsFor } from './chat-suggest.js';
import { useBotCommands, useCommandBox } from './chat-bot-commands.js';
import { useInlineBox } from './chat-inline-bots.js';
import {
  AttachButton,
  AttachDialog,
  DropHint,
  pasteFiles,
  useAttach,
  useDropFiles,
} from './chat-attach.js';
import { PollDialog, usePollCreate } from './chat-poll-create.js';
import { ShareDialog, useShare } from './chat-share.js';
import { TopicTabs } from './chat-topics.js';
import {
  ScheduleDialog,
  ScheduledButton,
  ScheduledList,
  SendMenu,
  useScheduled,
  useSendMenu,
} from './chat-schedule.js';
import { formatShortcut } from './text-shortcuts.js';
import { useEmojiPanel } from './chat-emoji.js';
import { useStickerTabs } from './chat-stickers.js';
import { useVoice } from './chat-voice.js';
import { useFormatBar } from './chat-format-bar.js';
import {
  KeyboardToggle,
  ReplyKeyboard,
  useReplyKeyboard,
} from './chat-bots.js';
import { AutopilotBar, DraftCard, NextChatBar } from './chat-automation.js';
import { groupAlbums, rowIds } from './chat-album.js';
import { SearchBar, SearchButton, useChatSearch } from './chat-search.js';
import {
  DayPill,
  FloatingDay,
  dayBreaks,
  useDayJump,
  useNewer,
} from './chat-days.js';
import { goToMessage, useArrival, useStreamJumps } from './chat-jump.js';
import { NOTICE, Sidebar, noticeInWords } from './chat-sidebar.js';

export { failureText, waitingText } from './chat-failure.js';
export { autopilotText } from './chat-automation.js';
export { reasonText } from './notice.js';
export { noticeInWords } from './chat-sidebar.js';

const el = React.createElement;

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

const AutomationMenu = ({ menu, autopilot }) => {
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
            : menu.automations.map((a) => {
                const apOn = autopilot?.stateFor?.(a.id)?.on;
                return el('div', { key: a.id, className: 'chat-menu-item' }, [
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
                      'data-automation': a.id,
                      onClick: () => menu.run(a, { test: false }),
                    },
                    t('chat.automation.run')
                  ),
                  apOn
                    ? el(
                        'button',
                        {
                          key: 'ap',
                          type: 'button',
                          role: 'menuitem',
                          'data-action': 'autopilot-stop',
                          'data-automation': a.id,
                          onClick: () => autopilot.stop(a.id),
                        },
                        t('chat.autopilot.stop')
                      )
                    : el(
                        'button',
                        {
                          key: 'ap',
                          type: 'button',
                          role: 'menuitem',
                          'data-action': 'autopilot-start',
                          'data-automation': a.id,
                          onClick: () => autopilot?.start(a.id),
                        },
                        t('chat.draft.autopilot')
                      ),
                ]);
              })
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
// A personal chat's, and every Telegram chat's (its profile, R-Y111).
const hasAbout = (chat) =>
  Boolean(chat?.personal) || chat?.source === 'telegram';

const AboutButton = ({ about, onAbout, chat }) => {
  const t = useT();
  const label = t(chat?.personal ? 'chat.about.open' : 'chat.about.chatInfo');
  return el(
    'button',
    {
      type: 'button',
      className: about ? 'chat-about icon-btn active' : 'chat-about icon-btn',
      'data-action': 'chat-about',
      'aria-label': label,
      'aria-pressed': about,
      title: label,
      onClick: onAbout,
    },
    el(Icon, { name: 'user' })
  );
};

const Header = ({ state, api, onBack, about, onAbout, find, saved }) => {
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
      el('div', { key: 'n', className: 'chat-title-row' }, [
        el('strong', { key: 'n' }, chat.name),
        el(TtlBadge, { key: 'ttl', chat, info: state.info }),
      ]),
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
    el(SearchButton, { key: 'find', find }),
    el(SavedToggle, { key: 'saved', saved }),
    hasAbout(chat)
      ? el(AboutButton, { key: 'about', about, onAbout, chat })
      : null,
    el(AutomationMenu, {
      key: 'm',
      menu: state.menu,
      autopilot: state.autopilot,
    }),
  ]);
};

// A message's delivery, as messengers show it: a clock while it goes
// out (only after a second, so a quick send never flashes it — Telegram
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
export const followMove = ({
  opened,
  line,
  near,
  added,
  justSent,
  detached = false,
}) => {
  if (line) {
    return 'line';
  }
  // A chat opened far back (R-Y106) is read where it is: no following.
  if (detached && !opened && !justSent) {
    return null;
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
      // A failed load is asked again by itself (R-Y96): the arc stays.
      'data-older': history.failed ? 'retrying' : 'loading',
    },
    [
      // Telegram shows the arc alone above the messages.
      el(Spinner, { key: 's' }),
      el('span', { key: 't', className: 'sr-only' }, t('chat.loadingEarlier')),
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
      detached: state.history?.detached,
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
  const newer = useNewer(follow.box, state.history);
  useArrival(state);
  useSeen(follow.box, state.seen, state.messages);
  const onScroll = () => {
    follow.onScroll();
    keep();
    older();
    newer();
  };
  const days = useDayJump({
    history: state.history,
    first: state.history?.first ?? null,
    box: follow.box,
    toEnd: follow.toEnd,
    notify: () => state.notify?.({ kind: 'date-failed' }),
  });
  // What leaves the chat goes like in Telegram (./chat-leaving.js).
  // A window opened anew (a jump to a date) is not messages leaving.
  const view = `${state.current?.key ?? ''}:${state.history?.view ?? 0}`;
  const shown = useLeaving(state.messages, view);
  // Reply lookups: what is shown, then the originals fetched for it.
  const shownById = new Map(shown.map((m) => [m.id, m]));
  // An album is one row (./chat-album.js).
  const messages = groupAlbums(shown);
  const msgById = {
    get: (id) => shownById.get(id) ?? state.replyTargets?.get(id),
  };
  const runs = messageRuns(messages);
  const breaks = dayBreaks(messages);
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
    scrollTo: (id) => onScrollTo(id),
  });
  const alone =
    Boolean(state.current.personal) || state.current.kind === 'channel';
  // Go to a message, back from replies, to the newest (R-Y107, R-Y109).
  const { onScrollTo, down, onDown } = useStreamJumps(state, follow);
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
      // The date of what is at the top, over it while scrolling.
      el(FloatingDay, { key: 'day', box: follow.box, onOpen: days.open }),
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
            breaks.has(message.id)
              ? el(DayPill, {
                  key: `day-${breaks.get(message.id)}`,
                  day: breaks.get(message.id),
                  onOpen: days.open,
                })
              : null,
            rowIds(message).includes(state.unreadLine)
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
            el(DraftCard, {
              key: draft.id,
              draft,
              drafts: state.drafts,
              autopilot: state.autopilot,
            })
          ),
          messages.length === 0
            ? el('p', { key: 'empty', className: 'meta' }, t('chat.empty'))
            : null,
          el('div', { key: 'end', ref: follow.end }),
        ]
      ),
    ]
  );
  return [
    scroll,
    days.calendar,
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
      onClick: onDown,
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

// Telegram's words for emoji (R-Y117), when a Telegram user account is
// there: for the emoji panel's search in any chat.
const emojiKeywordsOf = (state, api) =>
  state.telegram?.kind === 'user' &&
  typeof api?.telegramEmojiKeywords === 'function'
    ? (lang) => api.telegramEmojiKeywords({ lang })
    : null;

// "Send without sound" and "Schedule message" for the message box and
// the files' box, and the chat's scheduled messages (./chat-schedule.js).
const useSendLater = ({ state, api, composer, attach }) => {
  const scheduled = useScheduled({ state, api });
  const textMenu = useSendMenu(scheduled.enabled);
  const filesMenu = useSendMenu(scheduled.enabled);
  const [picking, setPicking] = useState(null); // 'text' | 'files'
  const [listing, setListing] = useState(false);
  const sendWith = (what, when) =>
    what === 'files' ? attach.send(when) : composer.send(when);
  const pick = (what) => (key) =>
    key === 'sendSilent' ? sendWith(what, { silent: true }) : setPicking(what);
  const closeList = useCallback(() => setListing(false), []);
  const parts = [
    el(SendMenu, { key: 'text-menu', menu: textMenu, onPick: pick('text') }),
    el(SendMenu, { key: 'files-menu', menu: filesMenu, onPick: pick('files') }),
    picking
      ? el(ScheduleDialog, {
          key: 'when',
          onClose: () => setPicking(null),
          onPick: (at) =>
            sendWith(picking, { scheduleDate: Math.floor(at / 1000) }),
        })
      : null,
    listing
      ? el(ScheduledList, { key: 'scheduled', scheduled, onClose: closeList })
      : null,
  ];
  return {
    scheduled,
    textMenu,
    filesMenu,
    openList: () => setListing(true),
    parts,
  };
};

const unless = (hide, part) => (hide ? null : part);

const composing = (event) =>
  Boolean(event.nativeEvent?.isComposing) || event.keyCode === 229;

const Composer = ({ state, api, keys }) => {
  const t = useT();
  const { composer } = state;
  const text = useComposerText(composer);
  const suggest = useSuggestionsFor(state.suggester, text, state.suggest);
  // Files and photos: the paperclip, a paste, a drop (R-Y99).
  const attach = useAttach({ state, api });
  const dragging = useDropFiles(attach);
  // A new poll, from the paperclip's menu (R-Y121).
  const poll = usePollCreate({ state, api, composer });
  // A place or a contact, from the same menu (R-Y142).
  const share = useShare({ state, api, composer });
  // The Send buttons' menu; scheduled messages (R-Y102).
  const later = useSendLater({ state, api, composer, attach });
  // The emoji panel (R-Y104), with stickers and GIFs (R-Y105).
  const box = useRef(null);
  const typeText = (next) => composer.setText(next, { typed: true });
  const stickers = useStickerTabs({ state, api, composer });
  const emoji = useEmojiPanel({
    box,
    setText: typeText,
    extra: stickers.tabs,
    keywords: emojiKeywordsOf(state, api),
  });
  // With nothing typed, the microphone (R-Y108).
  const voice = useVoice({ state, api });
  // Text selected in the box: the formatting bar (R-Y109).
  const format = useFormatBar({ box, setText: typeText });
  // A bot's keyboard under the box, and what it asks of it (R-Y110).
  const reply = useReplyKeyboard({ state, replyRefOf });
  // "/" lists a bot's commands; a bot chat's Menu button (R-Y135).
  const commands = useCommandBox({
    ...useBotCommands(api, state.current, state.info),
    text,
    composer,
  });
  // "@gif cats": an inline bot's answers over the box (R-Y138).
  const inline = useInlineBox({ api, state, composer, text });
  const onKeyDown = (event) => {
    keys?.(event);
    // Ctrl/Cmd+B, I, K… format the selection (R-Y101).
    if (event.defaultPrevented || formatShortcut(event, typeText)) {
      return;
    }
    const first = suggest.suggestions?.[0];
    // Enter that confirms an input method's word (Chinese, Japanese…) is
    // not a Send.
    if (composing(event) || inline.onKey(event) || commands.onKey(event)) {
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
  const form = el(
    'form',
    {
      key: 'form',
      className: 'chat-composer',
      onSubmit: (event) => {
        event.preventDefault();
        composer.send();
      },
    },
    [
      inline.panel,
      commands.list,
      el(Suggestions, { key: 's', suggest, composer }),
      format.bar,
      emoji.panel,
      el(ReplyBar, {
        key: 'rb',
        replyTo: composer.replyTo ?? null,
        onClear: composer.clearReplyTo,
      }),
      el('div', { key: 'row', className: 'chat-composer-row' }, [
        voice.bar,
        unless(voice.recording, commands.menuButton),
        voice.recording
          ? null
          : el(AttachButton, {
              key: 'attach',
              attach,
              onPoll: poll.enabled ? poll.show : null,
              ...share.menu,
            }),
        voice.recording
          ? null
          : el(ScheduledButton, {
              key: 'scheduled',
              scheduled: later.scheduled,
              onOpen: later.openList,
            }),
        voice.recording
          ? null
          : el('textarea', {
              key: 'input',
              ref: box,
              rows: 1,
              placeholder: reply.placeholder || t('chat.placeholder'),
              'aria-label': t('chat.placeholder'),
              value: text,
              onChange: (event) =>
                composer.setText(event.target.value, { typed: true }),
              onKeyDown,
              onPaste: pasteFiles(attach),
            }),
        voice.recording ? null : el(KeyboardToggle, { key: 'kb', reply }),
        voice.recording ? null : emoji.button,
        voice.enabled && (voice.phase !== 'idle' || !text.trim())
          ? voice.button
          : el(
              'button',
              {
                key: 'send',
                type: 'submit',
                className: 'primary send',
                disabled: !text.trim(),
                'aria-busy': composer.sending ? 'true' : undefined,
                'aria-label': t('common.send'),
                ...later.textMenu.props,
              },
              el(Icon, { name: 'send', size: 18 })
            ),
      ]),
      el(ReplyKeyboard, { key: 'reply-kb', reply }),
    ]
  );
  return el(React.Fragment, null, [
    el(DropHint, { key: 'drop', over: dragging }),
    form,
    el(AttachDialog, {
      key: 'files',
      attach,
      sendProps: later.filesMenu.props,
    }),
    poll.shown ? el(PollDialog, { key: 'poll', poll }) : null,
    el(ShareDialog, { key: 'share', share, api }),
    ...later.parts,
    ...(stickers.parts ?? []),
  ]);
};

// Pinned message bar shown when the newest loaded pinned message is known.
// The chat's pinned message above the stream, as in Telegram: an
// accent bar, "Pinned message" and one line of it; a click goes to it.
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
const ChatTop = ({ state, api, onBack, saved }) => {
  const [about, setAbout] = useState(false);
  const chat = about && hasAbout(state.current) ? state.current : null;
  const find = useChatSearch({
    api,
    current: state.current,
    messages: state.messages,
    reach: state.history?.reach,
  });
  return [
    el(Header, {
      key: 'h',
      state,
      api,
      onBack,
      about: Boolean(chat),
      onAbout: () => setAbout((open) => !open),
      find,
      saved,
    }),
    el(SearchBar, { key: 'find', find }),
    chat
      ? el(PersonPanel, {
          key: `about:${chat.key}`,
          api,
          chat,
          info: state.info ?? null,
          username: state.info?.username ?? null,
          onGo: (id) => {
            // Narrow, the column covers the messages: it goes.
            if (!globalThis.matchMedia?.('(min-width: 900px)').matches) {
              setAbout(false);
            }
            return goToMessage(id, state.history?.reach);
          },
          lastId: networkMessageId(
            state.messages.findLast((m) => !m.pending) ?? null
          ),
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
  // Saved Messages as chats, or as messages (R-Y143).
  const saved = useSavedView(state.current, state.info);
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
  const quote = { selfName, api, chatName: state.chatName };

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
                  saved,
                }),
            // A forum's topics, as Telegram's tabs layout (R-Y122).
            el(TopicTabs, { key: 'topics', forum: state.forum }),
            el(PinnedBar, {
              key: 'pin',
              pinned: state.pinned,
              onOpen: (id) => goToMessage(id, state.history?.reach),
            }),
            // Add contact, Block, Report spam over a stranger's chat (R-Y137).
            el(PeerBar, {
              key: `peer:${state.current.key}`,
              api,
              chat: state.current,
            }),
            el(ConnectionBanner, { key: 'b', banner: state.banner }),
            el(FailedBar, { key: 'failed', composer: state.composer }),
            el(AutopilotBar, { key: 'ap', autopilot: state.autopilot }),
            el(NextChatBar, {
              key: 'next',
              drafts: state.drafts,
              autopilot: state.autopilot,
            }),
            el(Notice, {
              key: 'n',
              notice: noticeInWords(t, state.notice),
              labels: NOTICE,
              dismiss: state.dismiss,
            }),
            saved.on
              ? el(SavedChats, { key: 'saved', api, chat: state.current })
              : el(Stream, { key: 's', state, api, actions }),
            saved.on
              ? null
              : el(Composer, { key: 'c', state, api, keys: actions.keys }),
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
