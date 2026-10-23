// The stories strip above the chat list, as Telegram Desktop's (R-Y140;
// learned, never copied): a round photo for each peer with stories, a ring
// round it while some are unread, the name under it, the user's own
// first; folded into a compact row of small photos, and gone when there
// are none. A click opens the viewer (./story-viewer.js); a right click
// offers Hide stories / Unhide stories (R-Y174).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { PeerAvatar } from './peer-avatar.js';
import { usePref } from './chat-notify.js';
import { StoryViewer } from './story-viewer.js';
import { AddBadge, StoryPostHost, useStoryPost } from './story-post.js';
import {
  hiddenPeers,
  markSeen,
  mergePeers,
  ringOf,
  setHidden,
  unreadPeers,
  visiblePeers,
} from './stories-model.js';

const el = React.createElement;

// Telegram pages the strip; a few pages are plenty for a strip.
const MAX_PAGES = 5;

// Every page of one list (the strip's, or the hidden ones), one after
// another; `add(peers)` sees each.
const loadPages = async (api, hidden, isLive, add) => {
  let state;
  for (let page = 0; page < MAX_PAGES && isLive(); page += 1) {
    const answer = await api.telegramStories({
      ...(state ? { state } : {}),
      ...(hidden ? { hidden: true } : {}),
    });
    if (!isLive() || !answer?.ok) {
      return;
    }
    if (!answer.notModified) {
      add(
        (answer.peers ?? []).map((p) => (hidden ? { ...p, hidden: true } : p))
      );
    }
    if (!answer.more || !answer.state) {
      return;
    }
    state = answer.state;
  }
};

/**
 * The strip's peers (pages read one after another, then the hidden
 * ones), `read(peer, id)` for a story shown: the ring goes at once,
 * Telegram is told; the viewer's state (`viewing`, `open(peer)`,
 * `close()`) and `hide(peer, hidden)` (R-Y148).
 */
export const useStories = (api, enabled) => {
  const [peers, setPeers] = useState([]);
  const [viewing, setViewing] = useState(null);
  // Bumped when a story was posted: the strip is read again (R-Y156).
  const [reloads, setReloads] = useState(0);
  const post = useStoryPost(api, enabled, () => setReloads((n) => n + 1));
  const held = useRef(peers);
  held.current = peers;
  useEffect(() => {
    if (!enabled || typeof api?.telegramStories !== 'function') {
      return undefined;
    }
    let live = true;
    const add = (page) => setPeers((now) => mergePeers(now, page));
    (async () => {
      await loadPages(api, false, () => live, add);
      await loadPages(api, true, () => live, add);
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [api, enabled, reloads]);
  const read = useCallback(
    (peerId, id) => {
      const peer = held.current.find((p) => p.peer === peerId);
      if (!peer || peer.self || id <= Number(peer.maxReadId)) {
        return;
      }
      setPeers((now) => markSeen(now, peerId, id));
      Promise.resolve(
        api?.telegramStoriesRead?.({ chat: peerId, maxId: id })
      ).catch(() => {});
    },
    [api]
  );
  // Hidden or not: Telegram first, then the strip follows.
  const hide = useCallback(
    async (peerId, hidden) => {
      const answer = await Promise.resolve(
        api?.telegramStoriesHide?.({ chat: peerId, hidden })
      ).catch(() => null);
      if (answer?.ok) {
        setPeers((now) => setHidden(now, peerId, hidden));
      }
      return Boolean(answer?.ok);
    },
    [api]
  );
  const open = useCallback((peerId) => {
    const now = held.current;
    const from = now.find((p) => p.peer === peerId);
    if (!from) {
      return;
    }
    const list = from.hidden ? hiddenPeers(now) : visiblePeers(now);
    setViewing({
      peers: list.map((p) => ({ ...p })),
      start: list.findIndex((p) => p.peer === peerId),
    });
  }, []);
  const close = useCallback(() => setViewing(null), []);
  const unread = unreadPeers(visiblePeers(peers));
  return {
    peers,
    post,
    read,
    hide,
    open,
    close,
    viewing,
    unread,
    // The ring of a chat row of the list: 'unread', 'seen' or ''.
    rings: (chat) =>
      chat.source === 'telegram' ? ringOf(peers, chat.chat) : '',
  };
};

// The user's own entry when they have no story yet (R-Y156): their
// avatar with a "+"; a click picks a file.
const addEntry = (me) => ({
  peer: me?.id ?? 'self',
  name: me?.name ?? '',
  self: true,
  add: true,
  unread: false,
});

const peerLabel = (t, peer) => {
  if (peer.add) {
    return t('chat.storyPost.add');
  }
  return peer.self ? t('chat.stories.mine') : peer.name;
};

// The ring fills while the story uploads (R-Y156).
const postingProps = (peer, progress) =>
  peer.self && progress !== null
    ? {
        'data-posting': 'true',
        style: { '--story-progress': `${Math.round(progress * 100)}%` },
      }
    : {};

const StoryPeer = ({
  api,
  t,
  peer,
  small,
  onOpen,
  onMenu,
  progress = null,
}) => {
  const label = peerLabel(t, peer);
  const posting = peer.self && progress !== null;
  return el(
    'button',
    {
      type: 'button',
      className: `story-peer${peer.unread ? ' has-unread' : ''}${
        posting ? ' is-posting' : ''
      }`,
      'data-story-peer': peer.peer,
      'data-unread': peer.unread ? 'true' : 'false',
      ...(peer.add ? { 'data-story-add': 'true' } : {}),
      ...postingProps(peer, progress),
      'aria-label': label,
      title: label,
      onClick: () => onOpen(peer.peer),
      onContextMenu: (event) => {
        if (!peer.self && !peer.add) {
          event.preventDefault();
          onMenu({ peer, x: event.clientX, y: event.clientY });
        }
      },
    },
    [
      el('span', { key: 'r', className: 'story-ring' }, [
        peer.add && !peer.name
          ? el('span', { key: 'a', className: 'avatar story-avatar' })
          : el(PeerAvatar, {
              key: 'a',
              api,
              source: 'telegram',
              peer: peer.peer,
              name: peer.name,
              className: 'avatar story-avatar',
            }),
        peer.add ? el(AddBadge, { key: 'b' }) : null,
      ]),
      small
        ? null
        : el(
            'span',
            { key: 'n', className: 'story-peer-name' },
            peer.self ? t('chat.stories.mine') : peer.name
          ),
    ]
  );
};

/** The viewer a click on a ring or a story opens (also from the chat list). */
export const StoryViewerHost = ({ api, stories }) =>
  el(React.Fragment, null, [
    stories.viewing
      ? createPortal(
          el(StoryViewer, {
            key: 'v',
            api,
            peers: stories.viewing.peers,
            start: stories.viewing.start,
            onRead: stories.read,
            onHide: stories.hide,
            onClose: stories.close,
            // "Add story" in the menu of one's own stories (R-Y156).
            onAdd: () => {
              stories.close();
              stories.post.start();
            },
          }),
          globalThis.document.body
        )
      : null,
    el(StoryPostHost, { key: 'p', api, post: stories.post }),
  ]);

// The strip's entries: the hidden ones, or the visible ones with the
// user's own "+" first when they have no story.
const entriesOf = (peers, showAway, post) => {
  const listed = showAway ? hiddenPeers(peers) : visiblePeers(peers);
  const own = listed.some((p) => p.self);
  return showAway || own ? listed : [addEntry(post.info?.me), ...listed];
};

// A right click on a person's or channel's entry offers Hide stories or
// Unhide stories (R-Y174); the strip follows the change at once.
const StripMenu = ({ t, menu, onHide, onClose }) => {
  useEffect(() => {
    const away = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') {
        return;
      }
      onClose();
    };
    globalThis.addEventListener('keydown', away);
    globalThis.addEventListener('pointerdown', away);
    globalThis.addEventListener('blur', away);
    return () => {
      globalThis.removeEventListener('keydown', away);
      globalThis.removeEventListener('pointerdown', away);
      globalThis.removeEventListener('blur', away);
    };
  }, [onClose]);
  const hidden = Boolean(menu.peer.hidden);
  return createPortal(
    el(
      'ul',
      {
        className: 'msg-context-menu stories-menu',
        role: 'menu',
        style: { left: menu.x, top: menu.y },
        onPointerDown: (event) => event.stopPropagation(),
      },
      el(
        'li',
        {
          role: 'menuitem',
          tabIndex: 0,
          'data-action': 'strip-story-hide',
          onClick: () => {
            onClose();
            onHide(menu.peer.peer, !hidden);
          },
        },
        t(hidden ? 'chat.stories.unhide' : 'chat.stories.hide')
      )
    ),
    globalThis.document.body
  );
};

/** The strip. Nothing when no one has stories and posting is not possible. */
export const StoriesStrip = ({ api, stories, hidden = false }) => {
  const t = useT();
  const [open, setOpen] = usePref('metaSovereignStoriesOpen', true);
  const [showHidden, setShowHidden] = useState(false);
  const [menu, setMenu] = useState(null);
  const { peers, post } = stories;
  if (hidden || (peers.length === 0 && !post.available)) {
    return null;
  }
  const away = hiddenPeers(peers);
  const entries = entriesOf(peers, showHidden && away.length > 0, post);
  const label = t(open ? 'chat.stories.collapse' : 'chat.stories.expand');
  return el(
    'div',
    {
      className: `stories-strip${open ? '' : ' is-compact'}`,
      'data-stories': open ? 'open' : 'compact',
    },
    [
      el(
        'button',
        {
          key: 't',
          type: 'button',
          className: 'ghost stories-toggle',
          'data-action': 'stories-toggle',
          'aria-expanded': open ? 'true' : 'false',
          'aria-label': label,
          title: label,
          onClick: () => setOpen(!open),
        },
        [
          el('span', { key: 'w' }, t('chat.stories.title')),
          el(Icon, { key: 'i', name: 'back', size: 14 }),
        ]
      ),
      away.length > 0 || showHidden
        ? el(
            'button',
            {
              key: 'h',
              type: 'button',
              className: 'ghost stories-toggle stories-hidden-toggle',
              'data-action': 'stories-hidden',
              'aria-pressed': showHidden ? 'true' : 'false',
              onClick: () => setShowHidden(!showHidden),
            },
            showHidden
              ? t('chat.stories.backToStrip')
              : t('chat.stories.hiddenList', { count: away.length })
          )
        : null,
      el(
        'div',
        { key: 'l', className: 'stories-list' },
        entries.map((peer) =>
          el(StoryPeer, {
            key: peer.add ? 'add' : peer.peer,
            api,
            t,
            peer,
            small: !open,
            progress: post.progress,
            onOpen: peer.add ? post.start : stories.open,
            onMenu: setMenu,
          })
        )
      ),
      menu
        ? el(StripMenu, {
            key: 'm',
            t,
            menu,
            onHide: stories.hide,
            onClose: () => setMenu(null),
          })
        : null,
    ]
  );
};
