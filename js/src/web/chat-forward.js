// Forwarding as Telegram Desktop does it (R-Y154; learned, never copied):
// picking the chat opens it with a bar over the message box, "Forward n
// messages" with the senders' names and a menu — Hide / Show sender's
// name, Hide / Show captions (when a message has a captioned file),
// Choose another chat. What is typed is sent first, as a message of its
// own; Enter or Send then forwards with the chosen options.

import React, { useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { networkMessageId } from './chat-model.js';
import { parseMessageParts } from './message-parts.js';

const el = React.createElement;

/** The distinct senders' names, in order (`you` for our own). */
export const senderNames = (messages, you) => {
  const names = [];
  for (const message of messages) {
    const name = message.sender === 'me' ? you : message.senderName;
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
};

/** Whether a message is a file or a picture with a caption. */
export const hasCaption = (message) => {
  const parts = parseMessageParts(message);
  return (
    Boolean(parts.media) &&
    parts.media.kind !== 'webpage' &&
    Boolean(parts.text)
  );
};

/** The forward waiting for a target chat, with its options off. */
export const stageForward = ({ messages, fromChat, to }) => ({
  messages,
  fromChat: String(fromChat),
  toKey: to.key,
  toChat: to.chat,
  toName: to.name,
  dropAuthor: false,
  dropMediaCaptions: false,
});

const Item = ({ action, label, onPick }) =>
  el(
    'button',
    {
      type: 'button',
      role: 'menuitem',
      className: 'forward-bar-item',
      'data-action': action,
      onClick: onPick,
    },
    label
  );

// The bar's menu: the two options and another chat.
const OptionsMenu = ({ staged, onChange, onChoose, close }) => {
  const t = useT();
  const pick = (change) => () => {
    change();
    close();
  };
  return el('div', { className: 'forward-bar-menu', role: 'menu' }, [
    el(Item, {
      key: 'name',
      action: 'forward-name',
      label: staged.dropAuthor
        ? t('chat.forwardBar.showName')
        : t('chat.forwardBar.hideName'),
      onPick: pick(() => onChange({ dropAuthor: !staged.dropAuthor })),
    }),
    staged.messages.some(hasCaption)
      ? el(Item, {
          key: 'captions',
          action: 'forward-captions',
          label: staged.dropMediaCaptions
            ? t('chat.forwardBar.showCaptions')
            : t('chat.forwardBar.hideCaptions'),
          onPick: pick(() =>
            onChange({ dropMediaCaptions: !staged.dropMediaCaptions })
          ),
        })
      : null,
    el(Item, {
      key: 'choose',
      action: 'forward-choose',
      label: t('chat.forwardBar.choose'),
      onPick: pick(onChoose),
    }),
  ]);
};

/**
 * The bar over the message box: `staged` is the forward waiting here,
 * `onChange(flags)` sets its options, `onChoose()` opens the chat list
 * again, `onCancel()` drops it.
 */
export const ForwardBar = ({ staged, you, onChange, onChoose, onCancel }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const names = senderNames(staged.messages, you);
  const subtitle = staged.dropAuthor
    ? t('chat.forwardBar.hidden')
    : names.join(', ');
  return el(
    'div',
    { className: 'forward-bar', 'data-forward-bar': staged.toKey },
    [
      el(Icon, { key: 'i', name: 'forward', size: 18 }),
      el('span', { key: 'b', className: 'forward-bar-body' }, [
        el(
          'span',
          { key: 't', className: 'forward-bar-title' },
          t('chat.forwardBar.title', { count: staged.messages.length })
        ),
        el('span', { key: 's', className: 'forward-bar-names' }, subtitle),
      ]),
      el(
        'button',
        {
          key: 'm',
          type: 'button',
          className: 'forward-bar-button',
          'data-action': 'forward-options',
          'aria-label': t('chat.forwardBar.options'),
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          onClick: () => setOpen((value) => !value),
        },
        el(Icon, { name: 'more', size: 18 })
      ),
      el(
        'button',
        {
          key: 'x',
          type: 'button',
          className: 'forward-bar-button',
          'data-action': 'forward-cancel',
          'aria-label': t('chat.forwardBar.cancel'),
          onClick: onCancel,
        },
        '✕'
      ),
      open
        ? el(OptionsMenu, {
            key: 'menu',
            staged,
            onChange,
            onChoose,
            close: () => setOpen(false),
          })
        : null,
    ]
  );
};

// Whether the messages can wait for a comment in a Telegram chat.
const staysInTelegram = (messages, to) =>
  to.source === 'telegram' &&
  messages.length > 0 &&
  messages.every(
    (m) => m.source === 'telegram' && networkMessageId(m) !== null
  );

// The composer, its Send also forwarding what waits: the typed comment
// goes first, then the forward. Editing a message is left alone.
const withStagedSend = (state, onSend, bar) => {
  const composer = Object.create(state.composer);
  composer.send = (options) =>
    state.composer.editing
      ? state.composer.send(options)
      : onSend(() => state.composer.send(options));
  return { ...state, composer, forwarding: true, forwardBar: bar };
};

// The options a forward keeps when its chat is chosen again.
const kept = (staged) => ({
  dropAuthor: staged?.dropAuthor ?? false,
  dropMediaCaptions: staged?.dropMediaCaptions ?? false,
});

/**
 * The forward waiting for its chat: `pick(messages, to)` stages it (or
 * forwards at once when it is not Telegram's alone) and opens `to`;
 * `wrap(state)` the state of that chat whose Send also forwards and
 * which holds the bar over the box (`forwardBar`), `choose(messages)` opens the chat list again.
 */
export const useForwardStage = ({ state, send, selection, you, choose }) => {
  const [staged, setStaged] = useState(null);
  const shown = Boolean(staged) && state.current?.key === staged.toKey;
  const forwardStaged = async (comment) => {
    const waiting = staged;
    setStaged(null);
    // The words first, as a message of their own.
    await Promise.resolve(comment()).catch(() => null);
    await send.forward(
      waiting.messages,
      { chat: waiting.toChat, name: waiting.toName },
      waiting
    );
  };
  const bar = shown
    ? el(ForwardBar, {
        key: 'forward-bar',
        staged,
        you,
        onChange: (flags) => setStaged((before) => ({ ...before, ...flags })),
        onChoose: () => choose(staged.messages),
        onCancel: () => setStaged(null),
      })
    : null;
  return {
    pick: async (messages, to) => {
      const fromChat = staged?.fromChat ?? String(state.current?.chat);
      selection.clear();
      if (!staysInTelegram(messages, to)) {
        await send.forward(messages, to, { fromChat });
        return;
      }
      setStaged({
        ...stageForward({ messages, fromChat, to }),
        ...kept(staged),
      });
      state.select?.(to.key);
    },
    wrap: (current) =>
      shown ? withStagedSend(current, forwardStaged, bar) : current,
  };
};
