// The stories strip above the chat list, as Telegram Desktop's (R-Y140;
// learned, never copied): a round photo for each peer with stories, a ring
// round it while some are unread, the name under it, the user's own
// first; folded into a compact row of small photos, and gone when there
// are none. A click opens the viewer (./story-viewer.js).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { PeerAvatar } from './peer-avatar.js';
import { usePref } from './chat-notify.js';
import { StoryViewer } from './story-viewer.js';
import { markSeen, mergePeers, unreadPeers } from './stories-model.js';

const el = React.createElement;

// Telegram pages the strip; a few pages are plenty for a strip.
const MAX_PAGES = 5;

/**
 * The strip's peers (pages read one after another), and `read(peer, id)`
 * for a story shown: the ring goes at once, Telegram is told.
 */
export const useStories = (api, enabled) => {
  const [peers, setPeers] = useState([]);
  const held = useRef(peers);
  held.current = peers;
  useEffect(() => {
    if (!enabled || typeof api?.telegramStories !== 'function') {
      return undefined;
    }
    let live = true;
    (async () => {
      let state;
      for (let page = 0; page < MAX_PAGES && live; page += 1) {
        const answer = await api.telegramStories(state ? { state } : {});
        if (!live || !answer?.ok) {
          return;
        }
        if (!answer.notModified) {
          setPeers((now) => mergePeers(now, answer.peers ?? []));
        }
        if (!answer.more || !answer.state) {
          return;
        }
        state = answer.state;
      }
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [api, enabled]);
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
  const unread = unreadPeers(peers);
  return {
    peers,
    read,
    unread,
    // Whether a chat row of the list gets the ring.
    rings: (chat) => chat.source === 'telegram' && unread.has(chat.chat),
  };
};

const StoryPeer = ({ api, t, peer, small, onOpen }) =>
  el(
    'button',
    {
      type: 'button',
      className: `story-peer${peer.unread ? ' has-unread' : ''}`,
      'data-story-peer': peer.peer,
      'data-unread': peer.unread ? 'true' : 'false',
      'aria-label': peer.self ? t('chat.stories.mine') : peer.name,
      title: peer.self ? t('chat.stories.mine') : peer.name,
      onClick: () => onOpen(peer.peer),
    },
    [
      el(
        'span',
        { key: 'r', className: 'story-ring' },
        el(PeerAvatar, {
          api,
          source: 'telegram',
          peer: peer.peer,
          name: peer.name,
          className: 'avatar story-avatar',
        })
      ),
      small
        ? null
        : el(
            'span',
            { key: 'n', className: 'story-peer-name' },
            peer.self ? t('chat.stories.mine') : peer.name
          ),
    ]
  );

/** The strip, and the viewer a click opens. Nothing when no one has stories. */
export const StoriesStrip = ({ api, stories, hidden = false }) => {
  const t = useT();
  const [open, setOpen] = usePref('metaSovereignStoriesOpen', true);
  const [viewing, setViewing] = useState(null);
  const { peers, read } = stories;
  if (hidden || peers.length === 0) {
    return null;
  }
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
      el(
        'div',
        { key: 'l', className: 'stories-list' },
        peers.map((peer) =>
          el(StoryPeer, {
            key: peer.peer,
            api,
            t,
            peer,
            small: !open,
            onOpen: (id) =>
              setViewing({
                peers: peers.map((p) => ({ ...p })),
                start: peers.findIndex((p) => p.peer === id),
              }),
          })
        )
      ),
      viewing
        ? createPortal(
            el(StoryViewer, {
              key: 'v',
              api,
              peers: viewing.peers,
              start: viewing.start,
              onRead: read,
              onClose: () => setViewing(null),
            }),
            globalThis.document.body
          )
        : null,
    ]
  );
};
