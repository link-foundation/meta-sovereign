// The chat list beside the chat (R-Y31, R-Y49, R-Y68, R-Y71, R-Y97,
// R-Y103, R-Y140): the stories strip, the search box, the sort, the tabs (All / Private / Groups /
// Channels, or Telegram's folders), the archive's row, the chats a page
// at a time; while something is typed, what Telegram finds across all
// chats under them (R-Y107).

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { CHAT_FILTERS, CHAT_SORTS, groupChats } from './chat-model.js';
import { Notice } from './notice.js';
import { ArchiveHead, ArchiveItem, ChatItem } from './chat-list.js';
import { ShortcutsButton } from './shortcuts.js';
import { useChatListMenu } from './chat-list-menu.js';
import { usePinnedOrder } from './chat-pin-order.js';
import { NewChat } from './chat-create.js';
import { FolderTabMenu, tabDragStart } from './chat-folder-edit.js';
import { AddContactDialog } from './chat-contacts-edit.js';
import { MyProfile } from './chat-profile.js';
import { CallsButton } from './chat-calls.js';
import { Spinner } from './spinner.js';
import { failureText } from './chat-failure.js';
import {
  GlobalResults,
  openFoundMessage,
  useGlobalSearch,
} from './chat-global.js';
import { BirthdaysBlock } from './chat-person-extras.js';
import { StoriesStrip, StoryViewerHost, useStories } from './stories.js';
import { AppsSection, useSearchFocus } from './chat-apps-search.js';

const el = React.createElement;

/** A failed send's notice with the reason in words, as the composer's. */
export const noticeInWords = (t, notice) => {
  if (notice?.kind !== 'failed') {
    return notice;
  }
  const words = notice.code
    ? failureText(t, notice)
    : String(notice.error ?? '').trim();
  return { ...notice, error: words.replace(/[.!?。।]*$/u, '') };
};

export const NOTICE = {
  queued: 'chat.notice.queued',
  nothing: 'chat.notice.nothing',
  'sent-auto': 'chat.notice.sentAuto',
  'draft-send': 'chat.notice.sent',
  'draft-mark': 'chat.notice.manual',
  'draft-skip': 'chat.notice.skipped',
  stored: 'chat.notice.stored',
  failed: 'chat.notice.failed',
  'action-failed': 'chat.notice.actionFailed',
  'pin-reorder-failed': 'chat.pinReorder.failed',
  copied: 'chat.notice.copied',
  'link-copied': 'chat.notice.linkCopied',
  'image-copied': 'chat.notice.imageCopied',
  'music-saved': 'chat.music.saved',
  'date-failed': 'chat.days.failed',
  bot: 'chat.bot.toast',
  'bot-unsupported': 'chat.bot.unsupported',
};

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

// All / Private / Groups / Channels — in the list's order under each —
// or Telegram's folders (R-Y103).
const OWN_TABS = CHAT_FILTERS.map((key) => ({
  key,
  label: `chat.filter.${key}`,
}));

// A right-click on a folder's tab opens its menu (R-Y164).
const folderMenuAt = (tools, tab, event, open) => {
  const id = /^folder:(\d+)$/.exec(tab.key)?.[1];
  if (tools && id) {
    event.preventDefault();
    open({ id: Number(id), x: event.clientX, y: event.clientY });
  }
};

const FilterTabs = ({ state }) => {
  const t = useT();
  const [menu, setMenu] = useState(null);
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
    [
      menu && state.folderTools
        ? el(FolderTabMenu, {
            key: 'folder-menu',
            tools: state.folderTools,
            menu,
            close: () => setMenu(null),
          })
        : null,
      ...(state.tabs ?? OWN_TABS).map((tab) =>
        el(
          'button',
          {
            key: tab.key,
            type: 'button',
            role: 'tab',
            className:
              state.filter === tab.key ? 'chat-filter active' : 'chat-filter',
            'aria-selected': state.filter === tab.key ? 'true' : 'false',
            'data-filter': tab.key,
            // A folder's tab can be dragged sideways (R-Y172).
            ...(state.folderTools && /^folder:\d+$/.test(tab.key)
              ? {
                  'data-folder-tab': '',
                  onPointerDown: tabDragStart(state.folderTools),
                }
              : {}),
            onClick: () => state.setFilter(tab.key),
            onContextMenu: (event) =>
              folderMenuAt(state.folderTools, tab, event, setMenu),
          },
          [
            el('span', { key: 't' }, tab.title ?? t(tab.label)),
            tab.unread > 0
              ? el(
                  'span',
                  {
                    key: 'n',
                    className: 'chat-filter-unread',
                    'aria-label': t('chat.unread', { count: tab.unread }),
                  },
                  String(tab.unread)
                )
              : null,
          ]
        )
      ),
    ]
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

// A search across Telegram needs the user's account connected.
const globalOn = (state) =>
  Boolean(state.telegram?.connected) && state.telegram?.kind === 'user';

// Whether the search across Telegram has, or may yet have, something.
const globalShows = (global) =>
  global.on && (global.loading || global.messages.length > 0);

// What the search across Telegram shows under the chats, and what a
// click on a found chat or message opens (R-Y107).
const globalProps = (api, state, global) => ({
  api,
  search: global,
  listed: new Set(state.chats.map((c) => c.key)),
  onOpenPeer: (peer) => state.openAt({ source: 'telegram', ...peer }),
  onOpenMessage: (link) => openFoundMessage(state, link),
});

// The popular apps show while the search box is in use (R-Y194).
const appsShown = (state, focus) =>
  globalOn(state) && (focus.focused || Boolean(state.query));

// Stories give way to a search and to the archive.
const storiesHidden = (state) =>
  Boolean(state.query) || state.folder === 'archive';

// Contacts with a birthday today or soon (R-Y178), over the list.
const BirthdaysHost = ({ api, state }) =>
  el(BirthdaysBlock, {
    api,
    enabled: globalOn(state) && !storiesHidden(state),
    onOpenChat: (target) => state.openAt?.(target),
  });

export const Sidebar = ({ state, api }) => {
  const t = useT();
  const list = useRef(null);
  const pins = usePinnedOrder({ state, api });
  const listMenu = useChatListMenu({ state, api, pins });
  const page = useShownChats(list, { ...state, chats: pins.chats });
  useListLoading(list, state, page.chats.length);
  const global = useGlobalSearch(api, state.query, globalOn(state));
  const focus = useSearchFocus();
  const stories = useStories(api, globalOn(state));
  const oldest = state.sort === 'oldest';
  const item = (chat) =>
    el(ChatRow, {
      key: chat.key,
      api,
      chat,
      story: stories.rings(chat),
      tags: state.tags?.get(chat.key),
      onStory: stories.open,
      active: chat.key === state.current?.key,
      onSelect: state.select,
      onMenu: listMenu.onMenu,
      onPinDown: pins.onPinDown,
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
        globalOn(state)
          ? el(NewChat, { key: 'n', api, AddContact: AddContactDialog })
          : null,
        globalOn(state) ? el(MyProfile, { key: 'me', api }) : null,
        el(CallsButton, { key: 'calls', api, state }),
        el(ShortcutsButton, { key: 'keys', onOpen: state.openShortcuts }),
      ]),
      el('input', {
        key: 'q',
        type: 'search',
        className: 'chat-search',
        placeholder: t('chat.search'),
        'aria-label': t('chat.search'),
        ...focus.props,
        value: state.query,
        onChange: (event) => state.setQuery(event.target.value),
        // Esc empties the search, then leaves it (R-Y183).
        onKeyDown: (event) => {
          if (event.key === 'Escape') {
            if (state.query) {
              state.setQuery('');
            } else {
              event.target.blur();
            }
          }
        },
      }),
      // The popular mini apps, while the search is in use (R-Y194).
      el(AppsSection, {
        key: 'apps',
        api,
        show: appsShown(state, focus),
        query: state.query,
        open: (target) => state.openAt?.(target),
        release: focus.release,
      }),
      el(FilterTabs, { key: 'f', state }),
      el(StoriesStrip, {
        key: 'stories',
        api,
        stories,
        hidden: storiesHidden(state),
      }),
      el(StoryViewerHost, { key: 'viewer', api, stories }),
      el(BirthdaysHost, { key: 'birthdays', api, state }),
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
              globalShows(global)
                ? null
                : el(
                    'p',
                    { key: 'none', className: 'meta' },
                    t('chat.noMatches')
                  ),
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
        el(GlobalResults, {
          key: 'global',
          ...globalProps(api, state, global),
        }),
      ]
    ),
    listMenu.menu,
    // With no chat open, what the list's menu could not do shows here.
    state.current
      ? null
      : el(Notice, {
          key: 'n',
          notice: noticeInWords(t, state.notice),
          labels: NOTICE,
          dismiss: state.dismiss,
        }),
  ]);
};
