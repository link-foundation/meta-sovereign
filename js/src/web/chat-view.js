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
import { PinnedBar } from './chat-pinned.js';
import { RequestsBar } from './chat-join-requests.js';
import { NotifyButton } from './chat-notify-settings.js';
import { TtlBadge } from './chat-ttl.js';
import { ChatReactionsScope } from './chat-reactions.js';
import { ChatWall } from './chat-wallpaper.js';
import { useChatTheme } from './chat-theme.js';
import { SavedChats, SavedToggle, useSavedView } from './chat-saved.js';
import {
  SavedTagBar,
  SavedTagResults,
  useSavedTags,
} from './chat-saved-tags.js';
import React, { useCallback, useRef, useState } from 'react';
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
import { isBirthdayToday } from './profile-extras-model.js';
import { PersonPanel } from './person-panel.js';
import { UnreadMarks, useUnreadMarks } from './chat-marks.js';
import { MessageBubble, QuoteContext, ReplyQuote } from './chat-message.js';
import { ChatAvatar } from './chat-list.js';
import { EmojiStatus } from './emoji-status.js';
import { replyRefOf, useChatActions } from './chat-actions.js';
import { useMessageLinks } from './chat-link-open.js';
import { TagSearchHost } from './chat-tags.js';
import { BusinessIntro } from './chat-business-profile.js';
import { BotBar } from './chat-business-bots.js';
import { useBusinessLinks } from './chat-business-link-open.js';
import { SelectionTop } from './chat-selection.js';
import { useDragSelect } from './chat-drag.js';
import { Busy, ChatListSkeleton, Spinner } from './spinner.js';
import { useComposerText, useSuggestionsFor } from './chat-suggest.js';
import {
  appTarget,
  useBotCommands,
  useCommandBox,
} from './chat-bot-commands.js';
import { useInlineBox } from './chat-inline-bots.js';
import { useLinkPreview } from './chat-link-preview.js';
import { EditBar, hasMedia, useCaretAtEnd } from './chat-edit-mode.js';
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
import { ForumViewMenu, stripForum, useForumView } from './chat-forum-view.js';
import { TopicClosedBar, topicClosedFor } from './chat-topic-admin.js';
import {
  ScheduleDialog,
  ScheduledButton,
  ScheduledList,
  SendMenu,
  useScheduled,
  useSendMenu,
} from './chat-schedule.js';
import { canEffect, EffectPanel } from './chat-effects.js';
import { formatShortcut } from './text-shortcuts.js';
import { useEmojiPanel } from './chat-emoji.js';
import { useStickerTabs } from './chat-stickers.js';
import { useVoice } from './chat-voice.js';
import { useRoundVideo } from './chat-round-record.js';
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
import { useSendAs } from './chat-send-as.js';
import { useLiveWatch } from './live-watch.js';
import {
  OlderRow,
  UnreadLine,
  useFollow,
  useKeepPlace,
  useOlder,
  useSeen,
} from './chat-follow.js';

// The list's paging helpers live in ./chat-follow.js; their tests read
// them here.
export { addedAfter, followMove } from './chat-follow.js';

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

const Header = ({
  state,
  api,
  onBack,
  about,
  onAbout,
  find,
  saved,
  forumView,
}) => {
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
        isBirthdayToday(state.info?.birthday)
          ? el(
              'span',
              {
                key: 'bd',
                className: 'birthday-mark',
                'data-birthday-today': 'true',
                title: t('chat.birthday.today'),
              },
              '\u{1F382}'
            )
          : null,
        chat.emojiStatus
          ? el(EmojiStatus, { key: 'es', status: chat.emojiStatus, api })
          : null,
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
    // View as messages / View as topics in a forum (R-Y171).
    el(ForumViewMenu, { key: 'forum-view', view: forumView }),
    el(NotifyButton, { key: 'notify', api, chat }),
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
            ? el(BusinessIntro, {
                key: 'empty',
                api,
                chat: state.current,
                fallback: el('p', { className: 'meta' }, t('chat.empty')),
              })
            : null,
          el('div', { key: 'end', ref: follow.end }),
        ]
      ),
    ]
  );
  return [
    // The background behind the messages is its own layer (R-Y155).
    el('div', { key: 'wall', className: 'chat-wall' }, [
      el(ChatWall, {
        key: 'layer',
        api,
        chat: state.current.chat,
        info: state.info,
      }),
      el(
        ChatReactionsScope,
        { key: 'scope', chat: state.current, info: state.info },
        scroll
      ),
    ]),
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
  // "Send with effect" in a private chat's text box (R-Y149).
  const effects = canEffect(state, api);
  const textMenu = useSendMenu(scheduled.enabled || effects);
  // The files' box offers it too (R-Y161).
  const filesMenu = useSendMenu(scheduled.enabled || effects);
  const [effecting, setEffecting] = useState(null); // 'text' | 'files'
  const [picking, setPicking] = useState(null); // 'text' | 'files'
  const [listing, setListing] = useState(false);
  const sendWith = (what, when) =>
    what === 'files' ? attach.send(when) : composer.send(when);
  const pick = (what) => (key) => {
    if (key === 'sendEffect') {
      setEffecting(what);
    } else if (key === 'sendSilent') {
      sendWith(what, { silent: true });
    } else {
      setPicking(what);
    }
  };
  const menuItems = [
    ...(scheduled.enabled ? ['sendSilent', 'schedule'] : []),
    ...(effects ? ['sendEffect'] : []),
  ];
  const closeList = useCallback(() => setListing(false), []);
  const parts = [
    el(SendMenu, {
      key: 'text-menu',
      menu: textMenu,
      onPick: pick('text'),
      items: menuItems,
    }),
    effecting
      ? el(EffectPanel, {
          key: 'effects',
          api,
          over: effecting === 'files',
          onClose: () => setEffecting(null),
          onPick: (effect) => {
            setEffecting(null);
            sendWith(effecting, { effect });
          },
        })
      : null,
    el(SendMenu, {
      key: 'files-menu',
      menu: filesMenu,
      onPick: pick('files'),
      items: menuItems,
    }),
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

// The switch between microphone and camera, while the box is empty (R-Y150).
const recordButtons = ({ voice, round, empty }) =>
  empty && !voice.recording && !round.recording && round.switcher
    ? [round.switcher]
    : [];

// The microphone or camera in Send's place while the box is empty or a
// recording is on; null when Send belongs there.
const recordControl = ({ voice, round, empty }) => {
  const shown = empty || voice.phase !== 'idle' || round.phase !== 'idle';
  if (!shown) {
    return null;
  }
  if (round.active) {
    return round.button;
  }
  return voice.enabled ? voice.button : null;
};

const composing = (event) =>
  Boolean(event.nativeEvent?.isComposing) || event.keyCode === 229;

// Recording or editing: the buttons that make no sense are gone.
const isBare = (recording, editing) => Boolean(recording || editing);

// The bar over the box: the message being edited, else the reply.
const barOver = (composer, editing) =>
  editing
    ? el(EditBar, {
        key: 'eb',
        message: editing.message,
        onCancel: composer.cancelEdit,
      })
    : el(ReplyBar, {
        key: 'rb',
        replyTo: composer.replyTo ?? null,
        onClear: composer.clearReplyTo,
      });

// The row's end: the bot keyboard, emoji, the microphone/camera switch,
// and the microphone or camera in Send's place (never while editing).
const endButtons = (parts) => {
  const { bare, recording, editing, voice, round, text, reply, emoji } = parts;
  // A forward waiting is sent without words, too (R-Y154).
  const empty = !text.trim() && !parts.forwarding;
  return [
    bare ? null : el(KeyboardToggle, { key: 'kb', reply }),
    recording ? null : emoji.button,
    ...(editing ? [] : recordButtons({ voice, round, empty })),
    (editing ? null : recordControl({ voice, round, empty })) ??
      el(SendButton, {
        key: 'send',
        composer: parts.composer,
        editing,
        text,
        forwarding: parts.forwarding,
        menu: parts.menu,
      }),
  ];
};

// The Send button (a check mark while a message is edited, R-Y146).
const SendButton = ({ composer, editing, text, menu, forwarding }) => {
  const t = useT();
  const empty =
    !text.trim() && !(editing && hasMedia(editing.message)) && !forwarding;
  return el(
    'button',
    {
      type: 'submit',
      className: 'primary send',
      disabled: empty,
      'aria-busy': composer.sending ? 'true' : undefined,
      'aria-label': editing ? t('common.save') : t('common.send'),
      'data-mode': editing ? 'edit' : undefined,
      ...(editing ? {} : menu.props),
    },
    el(Icon, { name: editing ? 'check' : 'send', size: 18 })
  );
};

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
  // Who sends in a supergroup: the avatar button (R-Y141).
  const sendAs = useSendAs(api, state.current);
  // Our live location follows us while it is shared (R-Y147).
  useLiveWatch({ api, state });
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
  // Or, switched over, the camera: a round video (R-Y150).
  const round = useRoundVideo({ state, api });
  const recording = voice.recording || round.recording;
  // Text selected in the box: the formatting bar (R-Y109).
  const format = useFormatBar({ box, setText: typeText });
  // A bot's keyboard under the box, and what it asks of it (R-Y110).
  const reply = useReplyKeyboard({ state, replyRefOf });
  // "/" lists a bot's commands; a bot chat's Menu button (R-Y135).
  const commands = useCommandBox({
    ...useBotCommands(api, state.current, state.info),
    api,
    text,
    composer,
    ...appTarget(state),
  });
  // "@gif cats": an inline bot's answers over the box (R-Y138).
  const inline = useInlineBox({ api, state, composer, text });
  // The link in the text, previewed above the box (R-Y145).
  const linkPreview = useLinkPreview({ api, state, text, composer });
  // Editing a message: the caret at the end, no files, no voice (R-Y146).
  const editing = composer.editing ?? null;
  const bare = isBare(recording, editing);
  useCaretAtEnd(box, editing?.message.id ?? null);
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
      // The forward waiting for a comment (R-Y154).
      state.forwardBar ?? null,
      barOver(composer, editing),
      linkPreview.bar,
      el('div', { key: 'row', className: 'chat-composer-row' }, [
        unless(bare, sendAs.button),
        voice.bar,
        round.overlay,
        unless(bare, commands.menuButton),
        bare
          ? null
          : el(AttachButton, {
              key: 'attach',
              attach,
              onPoll: poll.enabled ? poll.show : null,
              ...share.menu,
            }),
        bare
          ? null
          : el(ScheduledButton, {
              key: 'scheduled',
              scheduled: later.scheduled,
              onOpen: later.openList,
            }),
        recording
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
              onPaste: editing ? undefined : pasteFiles(attach),
            }),
        ...endButtons({
          bare,
          recording,
          editing,
          voice,
          round,
          text,
          reply,
          emoji,
          composer,
          forwarding: Boolean(state.forwarding),
          menu: later.textMenu,
        }),
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
    sendAs.dialog,
    ...later.parts,
    ...(stickers.parts ?? []),
  ]);
};

/** The screen itself, pure: everything comes from `state`. */
// The header, and beside the messages what the conversation tells about
// the person, open until closed (in every personal chat, as Telegram's
// profile column).
const ChatTop = ({ state, api, onBack, saved, forumView }) => {
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
      forumView,
    }),
    el(SearchBar, { key: 'find', find }),
    chat
      ? el(PersonPanel, {
          key: `about:${chat.key}`,
          api,
          chat,
          info: state.info ?? null,
          username: state.info?.username ?? null,
          onOpenChat: (target) => state.openAt?.(target),
          hasChat: (key) => state.hasChat?.(key) ?? false,
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

// A closed topic has no composer for those who cannot manage topics (R-Y153).
const ComposerOrClosed = ({ state, api, keys }) =>
  topicClosedFor(state.forum?.open, state.info)
    ? el(TopicClosedBar)
    : el(Composer, { state, api, keys });

export const ChatScreen = ({ state, api }) => {
  const { t, locale } = useLocaleContext();
  const [pane, setPane] = useState('list');
  const account = state.telegram?.account;
  const selfName =
    [account?.firstName, account?.lastName].filter(Boolean).join(' ') || null;
  const actions = useChatActions({ state, api, t, locale, selfName });
  // A link to a message opens in the app (R-Y154).
  useMessageLinks({ state, api });
  // A business chat link opens its chat with the text in the box (R-Y180).
  useBusinessLinks({ state, api });
  // Saved Messages as chats, or as messages (R-Y143).
  const saved = useSavedView(state.current, state.info);
  // A forum as its messages or as its topics (R-Y171).
  const forumView = useForumView({ api, state });
  // Its reaction tags and the filter they make (R-Y151).
  const tags = useSavedTags(api, state.current, state.info);
  // The chat's theme colours, scoped to its view (R-Y170).
  const theme = useChatTheme(api, state.current, state.info);
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
      // A clicked #hashtag or $cashtag searches (R-Y182).
      el(TagSearchHost, { key: 'tag-search', api, state }),
      state.current
        ? el('section', { key: 'main', className: 'chat-main', ...theme }, [
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
                  forumView,
                }),
            // A forum's topics, as Telegram's tabs layout (R-Y122).
            el(TopicTabs, {
              key: 'topics',
              forum: stripForum(forumView, state.forum),
              api,
              chat: state.current,
              info: state.info,
            }),
            el(PinnedBar, {
              key: 'pin',
              state,
              api,
              onOpen: (id) => goToMessage(id, state.history?.reach),
            }),
            // Add contact, Block, Report spam over a stranger's chat (R-Y137).
            el(PeerBar, {
              key: `peer:${state.current.key}`,
              api,
              chat: state.current,
            }),
            // The bot a business connected to this chat (R-Y180).
            el(BotBar, {
              key: `bot:${state.current.key}`,
              api,
              chat: state.current,
            }),
            // "N requested to join" for those who may invite (R-Y152).
            el(RequestsBar, {
              key: `requests:${state.current.key}`,
              api,
              chat: state.current,
              info: state.info,
              live: state.joinRequests,
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
            saved.on ? null : el(SavedTagBar, { key: 'tags', api, tags }),
            saved.on
              ? el(SavedChats, { key: 'saved', api, chat: state.current })
              : tags.active
                ? el(SavedTagResults, { key: 'tagged', api, tags })
                : el(Stream, { key: 's', state, api, actions }),
            // A closed topic has no composer for those who cannot manage
            // topics (R-Y153).
            saved.on
              ? null
              : el(ComposerOrClosed, {
                  key: 'c',
                  state: actions.withForward(state),
                  api,
                  keys: actions.keys,
                }),
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
