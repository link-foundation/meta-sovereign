// A bot's commands, as Telegram Desktop offers them (R-Y135; learned,
// never copied): "/" at the start of the box lists the commands of the
// bot (of the bots, in a group, each with its name), narrowing as one
// types; Up and Down move, Tab or Enter picks — in a group completed as
// `/command@botusername`; Enter sends it, Tab puts it in the box. A bot
// chat shows a "Menu" button at the left of the box that opens the same
// list (or, for a bot with a web-app menu, its mini app, R-Y168).

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { appUrl } from './web-apps-model.js';
import { openWebApp } from './chat-web-apps.js';

const el = React.createElement;

/**
 * The commands that `text` asks for: it starts with "/" and has no space
 * yet. `insert` is what picking writes (`/cmd@bot` in a group).
 */
export const matchCommands = (commands, text, { group = false } = {}) => {
  const typed = String(text ?? '');
  if (!typed.startsWith('/') || /\s/.test(typed)) {
    return [];
  }
  const [word, at] = typed.slice(1).toLowerCase().split('@');
  return (commands ?? [])
    .filter(
      (one) =>
        String(one.command).toLowerCase().startsWith(word) &&
        (at === undefined ||
          String(one.username ?? '')
            .toLowerCase()
            .startsWith(at))
    )
    .map((one) => ({
      ...one,
      insert:
        group && one.username
          ? `/${one.command}@${one.username}`
          : `/${one.command}`,
    }));
};

// Which kind of chat may have commands: a bot's, or a group's bots'.
const kindOf = (chat, info) => {
  if (chat?.source !== 'telegram') {
    return null;
  }
  // Groups have negative ids; the info may still be the last chat's.
  if (String(chat.chat).startsWith('-')) {
    return chat.kind === 'group' || info?.kind === 'group' ? 'group' : null;
  }
  return info?.bot ? 'bot' : null;
};

const NONE = { commands: [], menu: { kind: 'default' } };

/** The chat's commands, asked once per chat (bot and group chats only). */
export const useBotCommands = (api, chat, info) => {
  const kind = kindOf(chat, info);
  const id = chat?.chat ? String(chat.chat) : null;
  const known = useRef(new Map());
  const [, update] = useState(0);
  const can = typeof api?.telegramBotCommands === 'function';
  useEffect(() => {
    if (!kind || !id || !can || known.current.has(id)) {
      return;
    }
    known.current.set(id, NONE);
    Promise.resolve(api.telegramBotCommands({ chat: id })).then(
      (answer) => {
        if (answer?.ok) {
          known.current.set(id, {
            commands: answer.commands ?? [],
            menu: answer.menu ?? NONE.menu,
          });
          update((n) => n + 1);
        } else {
          known.current.delete(id);
        }
      },
      () => known.current.delete(id)
    );
  }, [kind, id, can]);
  return { ...(known.current.get(id) ?? NONE), kind };
};

/** The list over the box. */
export const CommandList = ({ items, index, group, onPick, onHover }) => {
  const t = useT();
  return el(
    'div',
    {
      className: 'bot-commands',
      role: 'listbox',
      'aria-label': t('chat.bot.commands'),
    },
    items.map((one, i) =>
      el(
        'button',
        {
          key: `${one.bot}:${one.command}`,
          type: 'button',
          role: 'option',
          className: 'bot-command',
          'data-command': one.command,
          'aria-selected': i === index ? 'true' : 'false',
          onMouseDown: (event) => event.preventDefault(),
          onMouseEnter: () => onHover(i),
          onClick: () => onPick(one, true),
        },
        [
          el('b', { key: 'c' }, `/${one.command}`),
          el(
            'span',
            { key: 'd', className: 'bot-command-text' },
            one.description
          ),
          group && (one.botName || one.username)
            ? el(
                'span',
                { key: 'b', className: 'bot-command-bot' },
                one.botName || `@${one.username}`
              )
            : null,
        ]
      )
    )
  );
};

// The Menu button: a web app's mini app (R-Y168), else the list's toggle.
const MenuButton = ({ menu, open, onToggle, onApp }) => {
  const t = useT();
  const url = menu.kind === 'webapp' ? appUrl(menu.url) : null;
  const label =
    menu.kind === 'webapp' && menu.text ? menu.text : t('chat.bot.menu');
  const icon = el(Icon, { key: 'i', name: 'menu', size: 18 });
  return url
    ? el(
        'button',
        {
          type: 'button',
          className: 'bot-menu-button is-app',
          'data-action': 'bot-menu',
          'data-web-app-menu': true,
          title: label,
          onClick: () => onApp(url),
        },
        [icon, el('span', { key: 't' }, label)]
      )
    : el(
        'button',
        {
          type: 'button',
          className: 'bot-menu-button',
          'data-action': 'bot-menu',
          'aria-expanded': open ? 'true' : 'false',
          onClick: onToggle,
        },
        [icon, el('span', { key: 't' }, label)]
      );
};

/** The chat and name a mini app opens for (R-Y168). */
export const appTarget = (state) => ({
  chat: state.current?.chat,
  name: state.info?.title ?? state.current?.name,
});

const STEPS = { ArrowDown: 1, ArrowUp: -1 };

/**
 * The composer's part: `{ list, menuButton, onKey }`. `onKey(event)` is
 * true when it took the key (the list open and the key one it uses).
 */
export const useCommandBox = ({
  commands,
  menu,
  kind,
  text,
  composer,
  chat,
  name,
}) => {
  const group = kind === 'group';
  const [menuOpen, setMenuOpen] = useState(false);
  const [closedAt, setClosedAt] = useState(null);
  const [index, setIndex] = useState(0);
  const typed = matchCommands(commands, text, { group });
  const items =
    menuOpen && !text ? matchCommands(commands, '/', { group }) : typed;
  const shown = items.length > 0 && closedAt !== text;
  useEffect(() => {
    setIndex(0);
    if (text) {
      setMenuOpen(false);
    }
  }, [text]);
  const close = () => {
    setMenuOpen(false);
    setClosedAt(text);
  };
  const pick = (one, send) => {
    setMenuOpen(false);
    if (send) {
      composer.setText('');
      composer.say(one.insert);
    } else {
      composer.setText(`${one.insert} `, { typed: true });
    }
  };
  const onKey = (event) => {
    if (!shown || event.shiftKey || event.ctrlKey || event.metaKey) {
      return false;
    }
    const step = STEPS[event.key];
    if (step) {
      setIndex((index + step + items.length) % items.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      pick(items[Math.min(index, items.length - 1)], event.key === 'Enter');
    } else if (event.key === 'Escape') {
      close();
    } else {
      return false;
    }
    event.preventDefault();
    return true;
  };
  const bot = kind === 'bot';
  const webapp = menu.kind === 'webapp' && appUrl(menu.url);
  return {
    onKey,
    list: shown
      ? el(CommandList, {
          key: 'bot-commands',
          items,
          index: Math.min(index, items.length - 1),
          group,
          onPick: pick,
          onHover: setIndex,
        })
      : null,
    menuButton:
      bot && (commands.length > 0 || webapp)
        ? el(MenuButton, {
            key: 'bot-menu',
            menu,
            open: menuOpen,
            onApp: (url) =>
              openWebApp({
                kind: 'menu',
                chat,
                bot: chat,
                url,
                buttonText: menu.text || undefined,
                name,
              }),
            onToggle: () => {
              setClosedAt(null);
              setMenuOpen(!menuOpen);
            },
          })
        : null,
  };
};
