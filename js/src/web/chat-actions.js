/**
 * What can be done with the open chat's messages, one or a selection of
 * them, as in Telegram (R-Y67): reply, edit, copy (the text, the part of
 * it selected, or several messages under their senders' names), copy
 * the message's link, pin or unpin, forward, select, delete. Telegram
 * messages go through /api/telegram/*, other networks' through
 * /api/message/* (R-Y38).
 */

import React, { useState } from 'react';
import { networkMessageId } from './chat-model.js';
import {
  DeleteDialog,
  EditDialog,
  ForwardPicker,
  PinDialog,
} from './chat-message.js';
import {
  isMine,
  menuItems,
  messageLink,
  selectionText,
  useSelection,
  useSelectionKeys,
} from './chat-selection.js';

const el = React.createElement;

// "Copied" shows this long, as Telegram's toast does.
const TOAST_MS = 2500;

const viaTelegram = (message) =>
  message.source === 'telegram' && networkMessageId(message) !== null;

const sentOnly = (messages) => messages.filter((m) => m && !m.pending);

// Messages that can be replied to or edited from the keyboard.
const replyable = (messages) =>
  messages.filter((m) => !m.service && !m.pending && !m.deleted);

/**
 * The reply target after Ctrl/Cmd+Up (`step` -1) or Down (+1) from
 * `current` (a message id or null): Up from none takes the newest, Down
 * past the newest takes none. → message or null
 */
export const replyStep = (messages, current, step) => {
  const list = replyable(messages);
  const at = list.findIndex((m) => m.id === current);
  if (at === -1) {
    return step < 0 ? (list.at(-1) ?? null) : null;
  }
  return list[at + step] ?? (step < 0 ? list[at] : null);
};

/** The newest message of the user's own that can be edited, or null. */
export const lastEditable = (messages) =>
  replyable(messages).findLast((m) => isMine(m) && m.body) ?? null;

// Which pin question the chat gets (./chat-message.js PinDialog).
const whereOf = (chat) => {
  if (chat?.personal) {
    return 'personal';
  }
  return chat?.kind === 'channel' ? 'channel' : 'group';
};

const replyRefOf = (message) => ({
  msgId: networkMessageId(message),
  linkId: message.id,
  senderName: message.senderName ?? message.sender,
  text: message.body ?? '',
});

// Each network's messages go their own way: Telegram's by their network
// ids, the rest through /api/message/*.
const split = (messages) => ({
  telegram: messages.filter(viaTelegram),
  other: messages.filter((m) => !viaTelegram(m)),
});

const useSenders = (state, api) => {
  const report = (answer) => {
    if (answer?.error) {
      state.notify?.({ kind: 'action-failed', error: answer.error });
    }
    return answer;
  };
  const generic = async (action, messages, body) => {
    if (messages.length === 0 || typeof api?.messageAction !== 'function') {
      return;
    }
    report(
      await api.messageAction(action, {
        ids: messages.map((m) => m.id),
        ...body,
      })
    );
  };
  const remove = async (messages, { revoke }) => {
    const { telegram, other } = split(sentOnly(messages));
    await generic('delete', other, { revoke });
    if (telegram.length > 0 && typeof api?.telegramDelete === 'function') {
      report(
        await api.telegramDelete({
          chat: state.current.chat,
          ids: telegram.map(networkMessageId),
          revoke,
        })
      );
    }
  };
  const forward = async (messages, toChat) => {
    const { telegram, other } = split(sentOnly(messages));
    await generic('forward', other, {
      toChat: toChat.chat,
      toTitle: toChat.name,
    });
    if (telegram.length > 0 && typeof api?.telegramForward === 'function') {
      report(
        await api.telegramForward({
          fromChat: state.current.chat,
          ids: telegram.map(networkMessageId),
          toChat: toChat.chat,
        })
      );
    }
  };
  const pin = async (message, options = {}) => {
    if (!viaTelegram(message) || typeof api?.telegramPin !== 'function') {
      return;
    }
    report(
      await api.telegramPin({
        chat: state.current.chat,
        id: networkMessageId(message),
        ...options,
      })
    );
  };
  return { generic, remove, forward, pin };
};

// The clipboard, then Telegram's short "Copied" toast.
const useCopy =
  (state) =>
  (text, kind = 'copied') => {
    if (!text) {
      return;
    }
    const done = () => {
      const notice = { kind };
      state.notify?.(notice);
      globalThis.setTimeout(
        () => state.notify?.((now) => (now === notice ? null : now)),
        TOAST_MS
      );
    };
    const writing = globalThis.navigator?.clipboard?.writeText?.(text);
    Promise.resolve(writing).then(done, () => {});
  };

/**
 * The open chat's message actions: `{ selection, onAction(action,
 * message, value), menuFor(message, { selectedText, selected }), bar,
 * keys, dialogs }`. `bar` holds the selection bar's handlers, `keys` the
 * composer's (Up edits the last own message, Ctrl/Cmd+Up and Down move
 * the reply), `dialogs` the open delete, edit or forward dialog.
 */
export const useChatActions = ({ state, api, t }) => {
  const selection = useSelection(state.current?.key ?? null);
  const [deleting, setDeleting] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [editing, setEditing] = useState(null);
  const [pinning, setPinning] = useState(null);
  const send = useSenders(state, api);
  const copy = useCopy(state);
  const messages = state.messages ?? [];
  const chosen = () => messages.filter((m) => selection.has(m.id));

  const onAction = (action, message, value) => {
    const act = {
      reply: () => state.composer.setReplyTo(replyRefOf(message)),
      copy: () => copy(message.body ?? ''),
      copySelected: () => copy(value),
      copyLink: () =>
        copy(
          messageLink(message, {
            chat: state.current?.chat,
            username: state.info?.username,
          }),
          'link-copied'
        ),
      pin: () => setPinning(message),
      unpin: () => send.pin(message, { unpin: true }),
      forward: () => setForwarding([message]),
      delete: () => setDeleting([message]),
      edit: () => setEditing(message),
      select: () => selection.start(message.id),
      unselect: () => selection.toggle(message.id),
      react: () =>
        message.pending
          ? null
          : send.generic('react', [message], { emoji: value }),
    }[action];
    act?.();
  };

  const bar = {
    count: selection.ids.length,
    onClear: selection.clear,
    onCopy: () => {
      copy(selectionText(chosen(), { me: t('chat.you') }));
      selection.clear();
    },
    onForward: () => setForwarding(chosen()),
    onDelete: () => setDeleting(chosen()),
  };
  useSelectionKeys(selection, { onCopy: bar.onCopy, onDelete: bar.onDelete });

  const keys = (event) => {
    const { composer } = state;
    const mod = event.ctrlKey || event.metaKey;
    if (
      event.key === 'ArrowUp' &&
      !mod &&
      !composer.text &&
      !composer.replyTo
    ) {
      const last = lastEditable(messages);
      if (last) {
        event.preventDefault();
        setEditing(last);
      }
      return;
    }
    if (mod && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const next = replyStep(
        messages,
        composer.replyTo?.linkId ?? null,
        event.key === 'ArrowUp' ? -1 : 1
      );
      if (next) {
        composer.setReplyTo(replyRefOf(next));
      } else {
        composer.clearReplyTo?.();
      }
    }
  };

  const menuFor = (message, { selectedText, selected }) =>
    menuItems({
      message,
      chat: state.current ?? {},
      info: state.info,
      selectedText,
      selected,
    });

  const dialogs = [
    deleting
      ? el(DeleteDialog, {
          key: 'del',
          messages: deleting,
          isGroup: !state.current?.personal,
          onClose: () => setDeleting(null),
          onDelete: (opts) => {
            send.remove(deleting, opts);
            setDeleting(null);
            selection.clear();
          },
        })
      : null,
    editing
      ? el(EditDialog, {
          key: 'edit',
          message: editing,
          onClose: () => setEditing(null),
          onSave: (text) => send.generic('edit', [editing], { text }),
        })
      : null,
    pinning
      ? el(PinDialog, {
          key: 'pin',
          where: whereOf(state.current),
          name: state.current?.name ?? '',
          onClose: () => setPinning(null),
          onPin: (options) => send.pin(pinning, options),
        })
      : null,
    forwarding
      ? el(ForwardPicker, {
          key: 'fwd',
          // A message forwards within its own network.
          chats: (state.chats ?? []).filter(
            (c) => c.source === state.current?.source
          ),
          onClose: () => setForwarding(null),
          onForward: async (toChat) => {
            await send.forward(forwarding, toChat);
            setForwarding(null);
            selection.clear();
          },
        })
      : null,
  ];

  return { selection, onAction, menuFor, bar, keys, dialogs };
};
