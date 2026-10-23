// "People": the contacts written to most, in a strip when the chat
// list's search box is used with nothing typed, as Telegram Desktop's
// search shows its frequent contacts (R-Y207; learned, never copied).
// A click opens the chat; a right click (or long press) offers to remove
// the person from the list and to turn the list off — Telegram's own
// setting, so the phone follows. Turned off, one line offers it back.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { ChatAvatar } from './chat-list.js';

const el = React.createElement;

const LONG_PRESS_MS = 500;

const usable = (api) =>
  typeof api?.telegramTopPeers === 'function' &&
  typeof api?.telegramTopPeerRemove === 'function' &&
  typeof api?.telegramTopPeersToggle === 'function';

/**
 * Frequent contacts while `on`: `{ enabled, peers, remove(chat),
 * toggle(enabled) }`; read each time `on` turns true.
 */
export const useTopPeers = (api, on) => {
  const [state, setState] = useState({ enabled: true, peers: [], read: false });
  useEffect(() => {
    if (!on || !usable(api)) {
      return undefined;
    }
    let live = true;
    api
      .telegramTopPeers()
      .then((answer) => {
        if (live && answer?.ok) {
          setState({
            enabled: answer.enabled !== false,
            peers: answer.peers ?? [],
            read: true,
          });
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [on]);
  return {
    ...state,
    remove: async (chat) => {
      setState((s) => ({
        ...s,
        peers: s.peers.filter((p) => p.chat !== chat),
      }));
      await api.telegramTopPeerRemove({ chat }).catch(() => null);
    },
    toggle: async (enabled) => {
      const answer = await api
        .telegramTopPeersToggle({ enabled })
        .catch(() => null);
      if (!answer?.ok) {
        return;
      }
      setState((s) => ({ ...s, enabled, peers: enabled ? s.peers : [] }));
      if (enabled) {
        const again = await api.telegramTopPeers().catch(() => null);
        if (again?.ok) {
          setState({
            enabled: again.enabled !== false,
            peers: again.peers ?? [],
            read: true,
          });
        }
      }
    },
  };
};

// The menu of a person: remove from the list, turn the list off.
const PersonMenu = ({ menu, top, onClose }) => {
  const t = useT();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    const onDown = (e) => {
      if (!e.target.closest?.('[data-top-menu]')) {
        onClose();
      }
    };
    globalThis.addEventListener?.('keydown', onKey);
    globalThis.addEventListener?.('mousedown', onDown);
    return () => {
      globalThis.removeEventListener?.('keydown', onKey);
      globalThis.removeEventListener?.('mousedown', onDown);
    };
  }, []);
  const item = (name, text, run) =>
    el(
      'button',
      {
        key: name,
        type: 'button',
        role: 'menuitem',
        className: 'top-menu-item',
        'data-action': name,
        onClick: () => {
          onClose();
          run();
        },
      },
      text
    );
  return createPortal(
    el(
      'div',
      {
        className: 'top-menu',
        role: 'menu',
        'data-top-menu': '',
        style: { left: menu.x, top: menu.y },
        // The search box keeps its focus, so the strip stays.
        onMouseDown: (e) => e.preventDefault(),
      },
      [
        item('top-remove', t('chat.top.remove'), () => top.remove(menu.chat)),
        item('top-off', t('chat.top.off'), () => top.toggle(false)),
      ]
    ),
    document.body
  );
};

const Person = ({ api, person, onOpen, onMenu }) => {
  const timer = useRef(null);
  const clear = () => globalThis.clearTimeout(timer.current);
  const menuAt = (x, y) => onMenu({ chat: person.chat, x, y });
  return el(
    'button',
    {
      type: 'button',
      className: 'top-person',
      'data-top-peer': person.chat,
      title: person.name,
      onClick: () => onOpen(person),
      onContextMenu: (e) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect?.();
        menuAt(e.clientX || r?.left || 0, e.clientY || r?.bottom || 0);
      },
      onTouchStart: (e) => {
        const touch = e.touches?.[0];
        timer.current = globalThis.setTimeout(
          () => menuAt(touch?.clientX ?? 0, touch?.clientY ?? 0),
          LONG_PRESS_MS
        );
      },
      onTouchEnd: clear,
      onTouchMove: clear,
    },
    [
      el(ChatAvatar, {
        key: 'a',
        api,
        chat: { source: 'telegram', chat: person.chat, name: person.name },
      }),
      el('span', { key: 'n', className: 'top-person-name' }, person.name),
    ]
  );
};

/**
 * The strip: shown while `show` (the box in use, nothing typed) and
 * Telegram has people to list. `open(person)` opens the chat, `release`
 * lets the box go a moment later.
 */
export const TopPeersSection = ({ api, show, open, release }) => {
  const t = useT();
  const on = show && usable(api);
  const top = useTopPeers(api, on);
  const [menu, setMenu] = useState(null);
  useEffect(() => {
    if (!on) {
      setMenu(null);
    }
  }, [on]);
  if (!on || !top.read) {
    return null;
  }
  if (!top.enabled) {
    return el(
      'section',
      {
        className: 'top-peers is-off',
        'data-top-peers': 'off',
        onMouseDown: (e) => e.preventDefault(),
      },
      el(
        'button',
        {
          type: 'button',
          className: 'top-turn-on',
          'data-action': 'top-on',
          onClick: () => top.toggle(true),
        },
        t('chat.top.on')
      )
    );
  }
  if (top.peers.length === 0) {
    return null;
  }
  const opened = (person) => {
    open(person);
    globalThis.setTimeout(release, 120);
  };
  return el(
    'section',
    {
      className: 'top-peers',
      'data-top-peers': 'on',
      'aria-label': t('chat.top.title'),
      onMouseDown: (e) => e.preventDefault(),
    },
    [
      el('h3', { key: 'h', className: 'top-title' }, t('chat.top.title')),
      el(
        'div',
        { key: 'l', className: 'top-list' },
        top.peers.map((person) =>
          el(Person, {
            key: person.chat,
            api,
            person,
            onOpen: opened,
            onMenu: setMenu,
          })
        )
      ),
      menu
        ? el(PersonMenu, {
            key: 'm',
            menu,
            top,
            onClose: () => setMenu(null),
          })
        : null,
    ]
  );
};
