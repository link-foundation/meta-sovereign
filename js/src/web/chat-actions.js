/**
 * What can be done with the open chat's messages, one or a selection of
 * them, as in Telegram Desktop (R-Y67, R-Y68): reply (quoting the part
 * of the text selected), edit, pin or unpin, save or copy a picture,
 * copy the text, a link or the message's link, forward, delete, select
 * (one, or up to this message), and for the selection copy as text,
 * forward, delete, unpin, clear; take back a vote or stop a poll
 * (R-Y74). Telegram messages go through
 * /api/telegram/*, other networks' through /api/message/* (R-Y38).
 */

import React, { useState } from 'react';
import { networkMessageId } from './chat-model.js';
import {
  DeleteDialog,
  EditDialog,
  ForwardPicker,
  PinDialog,
  mediaLabel,
  quotedName,
  quotedText,
} from './chat-message.js';
import { parseMessageParts } from './message-parts.js';
import { StopPollDialog } from './chat-poll.js';
import { useBotPress } from './chat-bots.js';
import { useComments } from './chat-comments.js';
import { useReaders } from './chat-readers.js';
import { useTranslate } from './chat-translate.js';
import { saveUrl } from './media-src.js';
import { expandAlbums, groupAlbums } from './chat-album.js';
import {
  bulkSelect,
  copyStamp,
  isMine,
  menuItems,
  messageLink,
  quoteOf,
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

export const replyRefOf = (message) => ({
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
  // A poll's: `poll-vote` with no options takes the vote back.
  const poll = async (action, message, body = {}) => {
    if (!viaTelegram(message) || typeof api?.telegramPoll !== 'function') {
      return;
    }
    report(
      await api.telegramPoll(action, {
        chat: state.current.chat,
        id: networkMessageId(message),
        ...body,
      })
    );
  };
  return { generic, remove, forward, pin, poll };
};

// The clipboard, then Telegram's short "Copied" toast.
const toast = (state, kind) => {
  const notice = { kind };
  state.notify?.(notice);
  globalThis.setTimeout(
    () => state.notify?.((now) => (now === notice ? null : now)),
    TOAST_MS
  );
};

const useCopy =
  (state) =>
  (text, kind = 'copied') => {
    if (!text) {
      return;
    }
    const writing = globalThis.navigator?.clipboard?.writeText?.(text);
    Promise.resolve(writing).then(
      () => toast(state, kind),
      () => {}
    );
  };

// A picture as PNG, the one kind every browser's clipboard takes.
const asPng = async (blob) => {
  if (blob.type === 'image/png' || !globalThis.createImageBitmap) {
    return blob;
  }
  const bitmap = await globalThis.createImageBitmap(blob);
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
};

// The message's picture (`photo`) or file (a sticker) from the server.
const mediaUrl = (api, chat, message, photo) => {
  const id = networkMessageId(message);
  return photo
    ? api?.telegramMediaUrl?.({ chat, id, size: 'w' })
    : api?.telegramFileUrl?.({ chat, id });
};

// Save As…: the browser saves the file where the user says.
const saveMedia = async (api, chat, message, photo) => {
  const url = await mediaUrl(api, chat, message, photo);
  await saveUrl(
    url,
    `${photo ? 'photo' : 'sticker'}_${networkMessageId(message)}${photo ? '.jpg' : '.webp'}`
  );
};

// Copy Image: the picture itself on the clipboard.
const copyImage = async (state, api, chat, message) => {
  const url = await mediaUrl(api, chat, message, true);
  const Item = globalThis.ClipboardItem;
  if (!url || !Item || !globalThis.navigator?.clipboard?.write) {
    return;
  }
  try {
    const blob = await asPng(await (await globalThis.fetch(url)).blob());
    await globalThis.navigator.clipboard.write([
      new Item({ [blob.type]: blob }),
    ]);
    toast(state, 'image-copied');
  } catch {
    state.notify?.({ kind: 'action-failed', error: 'clipboard' });
  }
};

/**
 * One message as Desktop's copy names it: who wrote it (the user by
 * their name), its text, what it shows ("Photo"), whom it answers.
 */
const describer =
  ({ t, selfName, msgById }) =>
  (message) => {
    const parts = parseMessageParts(message, msgById);
    const ref = parts.replyRef;
    const name = ref ? quotedName(t, ref, selfName) : null;
    return {
      author: isMine(message)
        ? (selfName ?? t('chat.you'))
        : (message.senderName ?? message.sender ?? ''),
      text: parts.text ?? '',
      media: parts.media ? mediaLabel(t, parts.media) || null : null,
      reply: name
        ? {
            name,
            label: t('chat.copyReplyTo', { name }),
            text: quotedText(t, ref),
          }
        : null,
    };
  };

const lookup = (state) => {
  const shown = new Map((state.messages ?? []).map((m) => [m.id, m]));
  return { get: (id) => shown.get(id) ?? state.replyTargets?.get?.(id) };
};

// The composer's keys: Up edits the last own message, Ctrl/Cmd+Up and
// Down move the reply.
const composerKeys = (state, messages, setEditing) => (event) => {
  const { composer } = state;
  const mod = event.ctrlKey || event.metaKey;
  if (event.key === 'ArrowUp' && !mod && !composer.text && !composer.replyTo) {
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

// The open delete, edit, pin or forward dialog.
const dialogsOf = ({ state, send, selection, open, close }) => {
  const { deleting, editing, pinning, forwarding, stopping } = open;
  const { setDeleting, setEditing, setPinning, setForwarding } = close;
  return [
    stopping
      ? el(StopPollDialog, {
          key: 'stop',
          onClose: () => close.setStopping(null),
          onStop: () => send.poll('poll-stop', stopping),
        })
      : null,
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
};

/**
 * The open chat's message actions: `{ selection, onAction(action,
 * message, value), menuFor(message, { selectedText, target }), top,
 * keys, dialogs }`. `top` holds the selection's top bar, `keys` the
 * composer's (Up edits the last own message, Ctrl/Cmd+Up and Down move
 * the reply), `dialogs` the open delete, edit or forward dialog.
 */
export const useChatActions = ({ state, api, t, locale, selfName = null }) => {
  const selection = useSelection(state.current?.key ?? null);
  const [deleting, setDeleting] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [editing, setEditing] = useState(null);
  const [pinning, setPinning] = useState(null);
  const [stopping, setStopping] = useState(null);
  const send = useSenders(state, api);
  const copy = useCopy(state);
  // A bot's buttons under its message (R-Y110).
  const bots = useBotPress({ state, api, copy });
  // A post's comments, a message's thread (R-Y126).
  const comments = useComments({ api });
  // Who read a message, who reacted to it (R-Y127).
  const readers = useReaders({ api });
  // A message translated in a box (R-Y132).
  const translate = useTranslate({ api });
  const messages = state.messages ?? [];
  // As the chat draws them: an album is one row, chosen with its items.
  const rows = groupAlbums(messages);
  const order = rows.map((m) => m.id);
  const chosen = () => expandAlbums(rows.filter((m) => selection.has(m.id)));
  const chat = state.current?.chat;

  const copySelected = () =>
    copy(
      selectionText(chosen(), {
        describe: describer({ t, selfName, msgById: lookup(state) }),
        stamp: (m) => copyStamp(m, locale),
      })
    );

  const onAction = (action, message, value) => {
    const act = {
      reply: () => state.composer.setReplyTo(replyRefOf(message)),
      quoteReply: () =>
        state.composer.setReplyTo({
          ...replyRefOf(message),
          quoteText: quoteOf(message, value),
        }),
      copy: () => copy(message.body ?? ''),
      copySelected: () => copy(value),
      copyUrl: () => copy(value, 'link-copied'),
      copyLink: () =>
        copy(
          messageLink(message, { chat, username: state.info?.username }),
          'link-copied'
        ),
      saveAs: () => saveMedia(api, chat, message, value === 'photo'),
      copyImage: () => copyImage(state, api, chat, message),
      pin: () => setPinning(message),
      unpin: () => send.pin(message, { unpin: true }),
      retractVote: () => send.poll('poll-vote', message, { options: [] }),
      stopPoll: () => setStopping(message),
      forward: () => setForwarding(expandAlbums([message])),
      delete: () => setDeleting(expandAlbums([message])),
      edit: () => setEditing(message),
      select: () => selection.add(message.id),
      selectBulk: () => {
        const ids = bulkSelect(selection.ids, message.id, order);
        if (ids) {
          selection.set(ids);
        }
      },
      copySelectedItems: copySelected,
      forwardSelected: () => setForwarding(chosen()),
      deleteSelected: () => setDeleting(chosen()),
      unpinSelected: () => {
        for (const one of chosen().filter((m) => m.raw?.pinned)) {
          send.pin(one, { unpin: true });
        }
      },
      clearSelection: selection.clear,
      react: () =>
        message.pending
          ? null
          : send.generic('react', [message], { emoji: value }),
    };
    act.copyPostLink = act.copyLink;
    act.bot = () => bots.press(message, value);
    act.comments = () => comments.open(message);
    act.readers = () => readers.open('readers', message);
    act.translate = () => translate.open(message);
    act.reactors = () => readers.open('reactors', message);
    return act[action]?.();
  };

  const canForward = chosen().every((m) => !m.pending);
  const top = {
    count: selection.ids.length,
    canForward,
    onClear: selection.clear,
    onForward: () => setForwarding(chosen()),
    onDelete: () => setDeleting(chosen()),
  };
  useSelectionKeys(selection, {
    onCopy: copySelected,
    onDelete: top.onDelete,
  });

  const keys = composerKeys(state, messages, setEditing);

  const menuFor = (message, { selectedText, target } = {}) =>
    menuItems({
      message,
      chat: state.current ?? {},
      info: state.info,
      selectedText,
      target,
      selection: {
        ids: selection.ids,
        has: selection.has,
        canForward,
        anyPinned: chosen().some((m) => m.raw?.pinned),
      },
      order,
    });

  const dialogs = dialogsOf({
    state,
    send,
    selection,
    open: { deleting, editing, pinning, forwarding, stopping },
    close: { setDeleting, setEditing, setPinning, setForwarding, setStopping },
  });

  return {
    selection,
    onAction,
    menuFor,
    top,
    keys,
    dialogs: [
      ...dialogs,
      bots.dialog,
      comments.dialog,
      readers.dialog,
      translate.dialog,
    ],
  };
};
