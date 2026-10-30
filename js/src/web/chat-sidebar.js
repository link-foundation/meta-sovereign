// The chat list beside the chat (R-Y31, R-Y49, R-Y68, R-Y71, R-Y97,
// R-Y103, R-Y140): the stories strip, the search box, the sort, the tabs (All / Private / Groups /
// Channels alongside Telegram's folders), the archive's row, the chats a page
// at a time; while something is typed, what Telegram finds across all
// chats under them (R-Y107).

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { CHAT_FILTERS, CHAT_SORTS } from './chat-model.js';
import { Notice } from './notice.js';
import { ArchiveHead, ArchiveItem, ChatItem } from './chat-list.js';
import { ShortcutsButton } from './shortcuts.js';
import { useChatListMenu } from './chat-list-menu.js';
import { usePinnedOrder } from './chat-pin-order.js';
import { NewChat } from './chat-create.js';
import { FolderTabMenu, tabDragStart } from './chat-folder-edit.js';
import { FolderUpdatesBar, folderIdOfKey } from './chat-folder-updates.js';
import { AddContactDialog } from './chat-contacts-edit.js';
import { Spinner } from './spinner.js';
import { PanelDivider } from './panel-resize.js';
import { failureText } from './chat-failure.js';
import {
  GlobalResults,
  openFoundMessage,
  useGlobalSearch,
} from './chat-global.js';
import { BirthdaysBlock } from './chat-person-extras.js';
import { StoriesStrip, StoryViewerHost, useStories } from './stories.js';
import { useStoriesEnabled } from './stories-pref.js';
import { AppsSection, useSearchFocus } from './chat-apps-search.js';
import { TopPeersSection } from './chat-top-peers.js';
import { useDraftsSync } from './chat-drafts-clear.js';
import { useSelectedTab } from './chat-tab-scroll.js';
import { VirtualChats, useListHandler } from './chat-list-window.js';

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
// independently within Telegram's folders (R-Y103, R-Z27).
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

// "+N" on a shared folder's tab that has new chats to join (R-Y211).
const newChatsBadge = (state, tab, t) => {
  const count = state.folderUpdates?.byFolder.get(
    folderIdOfKey(tab.key)
  )?.length;
  return count
    ? el(
        'span',
        {
          key: 'new',
          className: 'chat-filter-new',
          'data-new-chats': String(count),
          title: t('chat.folderUpdates.count', { count }),
          'aria-label': t('chat.folderUpdates.count', { count }),
        },
        `+${count}`
      )
    : null;
};

const FilterTabs = ({ state }) => {
  const t = useT();
  const [menu, setMenu] = useState(null);
  const tabs = state.tabs ?? OWN_TABS;
  const ref = useSelectedTab(
    state.filter,
    JSON.stringify(tabs.map((tab) => [tab.key, tab.title ?? t(tab.label)]))
  );
  if (typeof state.setFilter !== 'function') {
    return null;
  }
  return el(
    'div',
    {
      className: 'chat-filters',
      ref,
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
      ...tabs.map((tab) =>
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
            ...(state.folderTools && !tab.fixed && /^folder:\d+$/.test(tab.key)
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
            newChatsBadge(state, tab, t),
          ]
        )
      ),
    ]
  );
};

// A chat type narrows the selected folder, including All and Archive.
const KindTabs = ({ state }) => {
  const t = useT();
  return state.kindFilter === null || state.kindFilter === undefined
    ? null
    : el(
        'div',
        {
          className: 'chat-kind-filters',
          role: 'tablist',
          'aria-label': t('chat.filter.label'),
        },
        OWN_TABS.map((tab) =>
          el(
            'button',
            {
              key: tab.key,
              type: 'button',
              role: 'tab',
              className:
                state.kindFilter === tab.key
                  ? 'chat-filter active'
                  : 'chat-filter',
              'aria-selected': state.kindFilter === tab.key,
              'data-kind-filter': tab.key,
              onClick: () => state.setKindFilter(tab.key),
            },
            t(tab.label)
          )
        )
      );
};

// The directory's provider page is asked for when its end approaches.
const useListLoading = (list, state) => {
  const { moreChats, query, sort, chats } = state;
  useEffect(() => {
    const root = list.current;
    const node = root?.querySelector('[data-more]');
    if (!node || typeof globalThis.IntersectionObserver !== 'function') {
      return undefined;
    }
    const observer = new globalThis.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          moreChats?.more();
        }
      },
      { root, rootMargin: '100% 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [moreChats?.more, moreChats?.available, query, sort, chats.length]);
};

const listEnd = (t, state) =>
  state.moreChats?.available && !state.query
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

const sameTags = (a = [], b = []) =>
  a === b ||
  (a.length === b.length &&
    a.every(
      (tag, at) =>
        tag.id === b[at].id &&
        tag.title === b[at].title &&
        tag.color === b[at].color
    ));
const ChatRow = React.memo(ChatItem, (a, b) =>
  Object.keys(a).every((key) =>
    key === 'tags' ? sameTags(a.tags, b.tags) : a[key] === b[key]
  )
);

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
const storiesHidden = (state, enabled = true) =>
  !enabled || Boolean(state.query) || state.folder === 'archive';

// Contacts with a birthday today or soon (R-Y178), over the list.
const BirthdaysHost = ({ api, state }) =>
  el(BirthdaysBlock, {
    api,
    enabled: globalOn(state) && !storiesHidden(state),
    onOpenChat: (target) => state.openAt?.(target),
  });

// Frequent contacts, with the box in use and nothing typed (R-Y207); the
// drafts from other devices are read while the account is connected.
const PeopleHost = ({ api, state, focus }) => {
  useDraftsSync(api, globalOn(state));
  return el(TopPeersSection, {
    api,
    show: globalOn(state) && focus.focused && !state.query,
    open: (person) => state.openAt?.({ source: 'telegram', ...person }),
    release: focus.release,
  });
};

const SidebarDivider = () =>
  el(PanelDivider, {
    name: 'chats',
    variable: '--chat-sidebar-width',
    target: '.chat-shell',
    initial: 320,
    min: 220,
    max: 700,
  });

const virtualProps = (state, root, chats, item, t) => ({
  key: 'rows',
  root,
  chats,
  sort: state.sort,
  resetKey: JSON.stringify([
    state.query,
    state.filter,
    state.kindFilter,
    state.folder,
    state.sort,
  ]),
  selected: state.current?.key,
  item,
  prefetch: state.prefetch,
  t,
});

export const Sidebar = ({ state, api }) => {
  const t = useT();
  const list = useRef(null);
  const pins = usePinnedOrder({ state, api });
  const listMenu = useChatListMenu({ state, api, pins });
  useListLoading(list, state);
  const global = useGlobalSearch(api, state.query, globalOn(state));
  const focus = useSearchFocus();
  const [showStories] = useStoriesEnabled();
  const stories = useStories(api, globalOn(state) && showStories);
  const oldest = state.sort === 'oldest';
  const onSelect = useListHandler(state.select);
  const onMenu = useListHandler(listMenu.onMenu);
  const onStory = useListHandler(stories.open);
  const item = (chat) =>
    el(ChatRow, {
      key: chat.key,
      api,
      chat,
      story: stories.rings(chat),
      tags: state.tags?.get(chat.key),
      onStory,
      active: chat.key === state.current?.key,
      onSelect,
      onMenu,
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
  const moreRow = listEnd(t, state);
  return el('aside', { className: 'chat-sidebar' }, [
    el(SidebarDivider, { key: 'resize' }),
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
      el(PeopleHost, { key: 'top', api, state, focus }),
      el(FilterTabs, { key: 'f', state }),
      el(KindTabs, { key: 'kinds', state }),
      el(FolderUpdatesBar, { key: 'fu', state }),
      el(StoriesStrip, {
        key: 'stories',
        api,
        stories,
        hidden: storiesHidden(state, showStories),
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
              el(VirtualChats, virtualProps(state, list, pins.chats, item, t)),
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
