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
import { markLiveStopped } from './live-follow.js';
import {
  DeleteDialog,
  ForwardPicker,
  PinDialog,
  mediaLabel,
  quotedName,
  quotedText,
} from './chat-message.js';
import { parseMessageParts } from './message-parts.js';
import { StopPollDialog } from './chat-poll.js';
import { useForwardStage } from './chat-forward.js';
import { useBotPress } from './chat-bots.js';
import { useWebAppHost } from './chat-web-apps.js';
import { useComments } from './chat-comments.js';
import { useReaders } from './chat-readers.js';
import { useGameScores } from './chat-games.js';
import { useTranslate } from './chat-translate.js';
import { useSavedGifs } from './chat-saved-gifs.js';
import { useMusicSave } from './chat-music-save.js';
import { useReport } from './chat-report.js';
import { saveUrl } from './media-src.js';
import { expandAlbums, groupAlbums } from './chat-album.js';
import {
  bulkSelect,
  canEdit,
  copyStamp,
  isMine,
  isProtected,
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
export const lastEditable = (messages, now = Date.now()) =>
  replyable(messages).findLast((m) => canEdit(m, now)) ?? null;

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
    if (action === 'react') {
      // A reaction in Saved Messages may be a new tag (R-Y173).
      globalThis.dispatchEvent?.(new globalThis.Event('meta-reacted'));
    }
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
  // `fromChat`: where the messages are (not the open chat once the target
  // chat is open); the two flags hide the sender's name and the captions
  // (R-Y154).
  const forward = async (messages, toChat, options = {}) => {
    const { telegram, other } = split(sentOnly(messages));
    await generic('forward', other, {
      toChat: toChat.chat,
      toTitle: toChat.name,
    });
    if (telegram.length > 0 && typeof api?.telegramForward === 'function') {
      report(
        await api.telegramForward({
          fromChat: options.fromChat ?? state.current.chat,
          ids: telegram.map(networkMessageId),
          toChat: toChat.chat,
          ...(options.dropAuthor ? { dropAuthor: true } : {}),
          ...(options.dropMediaCaptions ? { dropMediaCaptions: true } : {}),
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
  // Stop sharing our live location (R-Y142).
  const stopLive = async (message) => {
    if (!viaTelegram(message) || typeof api?.telegramStopLive !== 'function') {
      return;
    }
    // Let go of the position at once (R-Y147).
    markLiveStopped(message);
    report(
      await api.telegramStopLive({
        chat: String(state.current.chat),
        id: networkMessageId(message),
      })
    );
  };
  return { generic, remove, forward, pin, poll, stopLive };
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

// Text for the clipboard, or a promise of it (R-Y154): a browser that
// takes a clipboard item of a promise keeps the click's permission while
// the text is being asked for.
const writeClipboard = (text) => {
  const clipboard = globalThis.navigator?.clipboard;
  const Item = globalThis.ClipboardItem;
  if (typeof text?.then !== 'function') {
    return Promise.resolve(clipboard?.writeText?.(text));
  }
  const blob = text.then((value) => {
    if (!value) {
      throw new Error('nothing to copy');
    }
    return new globalThis.Blob([value], { type: 'text/plain' });
  });
  if (Item && clipboard?.write) {
    return Promise.resolve(clipboard.write([new Item({ 'text/plain': blob })]));
  }
  return text.then((value) => clipboard?.writeText?.(value));
};

const useCopy =
  (state) =>
  (text, kind = 'copied') => {
    if (!text) {
      return;
    }
    writeClipboard(text).then(
      () => toast(state, kind),
      () => {}
    );
  };

// The message's link: a public chat's built here; otherwise Telegram's
// (channels.exportMessageLink, with `thread` in a topic), else built here
// when it cannot answer (R-Y154).
const linkOf = (state, api, message) => {
  const where = { chat: state.current?.chat, username: state.info?.username };
  const local = messageLink(message, where);
  const topic = Boolean(state.forum?.topic);
  if (!local || (where.username && !topic)) {
    return local;
  }
  if (typeof api?.telegramMessageLink !== 'function') {
    return local;
  }
  return api
    .telegramMessageLink({
      chat: String(where.chat),
      id: networkMessageId(message),
      thread: topic,
    })
    .then(
      (answer) => (answer?.ok && answer.link ? answer.link : local),
      () => local
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
const moveReply = (composer, messages, event) => {
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
};

const composerKeys = (state, messages) => (event) => {
  const { composer } = state;
  // Esc leaves the edit; the draft comes back (R-Y146).
  if (event.key === 'Escape' && composer.editing) {
    event.preventDefault();
    composer.cancelEdit();
    return;
  }
  const mod = event.ctrlKey || event.metaKey;
  const free = !composer.editing && !composer.text && !composer.replyTo;
  const last = event.key === 'ArrowUp' && !mod && free;
  if (last) {
    const editable = lastEditable(messages);
    if (editable) {
      event.preventDefault();
      composer.startEdit(editable);
    }
  } else if (mod && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
    moveReply(composer, messages, event);
  }
};

// The open delete, pin or forward dialog.
const dialogsOf = ({ state, send, selection, open, close, stage }) => {
  const { deleting, pinning, forwarding, stopping } = open;
  const { setDeleting, setPinning, setForwarding } = close;
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
          // The chat opens with the forward waiting over its box (R-Y154).
          onForward: async (toChat) => {
            setForwarding(null);
            await stage.pick(forwarding, toChat);
          },
        })
      : null,
  ];
};

// Shift-click: everything from the last picked message to this one.
const selectBulk = (selection, message, order) => {
  const ids = bulkSelect(selection.ids, message.id, order);
  if (ids) {
    selection.set(ids);
  }
};

// "Unpin" on a selection: each pinned message in it.
const unpinAll = (send, list) => {
  for (const one of list.filter((m) => m.raw?.pinned)) {
    send.pin(one, { unpin: true });
  }
};

/**
 * The open chat's message actions: `{ selection, onAction(action,
 * message, value), menuFor(message, { selectedText, target }), top,
 * keys, dialogs }`. `top` holds the selection's top bar, `keys` the
 * composer's (Up edits the last own message, Ctrl/Cmd+Up and Down move
 * the reply), `dialogs` the open delete or forward dialog.
 */
export const useChatActions = ({ state, api, t, locale, selfName = null }) => {
  const selection = useSelection(state.current?.key ?? null);
  const [deleting, setDeleting] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [pinning, setPinning] = useState(null);
  const [stopping, setStopping] = useState(null);
  const send = useSenders(state, api);
  const stage = useForwardStage({
    state,
    send,
    selection,
    you: selfName ?? t('chat.forwardBar.you'),
    choose: setForwarding,
  });
  const copy = useCopy(state);
  // A bot's buttons under its message (R-Y110).
  const bots = useBotPress({ state, api, copy });
  // A bot's mini app, over the chat (R-Y168).
  const webApp = useWebAppHost({ api, state });
  // A post's comments, a message's thread (R-Y126).
  const comments = useComments({ api });
  // Who read a message, who reacted to it (R-Y127).
  const readers = useReaders({ api });
  const games = useGameScores({ api });
  // A message translated in a box (R-Y132).
  const translate = useTranslate({ api });
  // Save GIF / Remove from GIFs on a GIF message (R-Y171).
  const gifs = useSavedGifs({ api, state });
  // "Add to profile music" on a song message (R-Y185).
  const saveMusic = useMusicSave({ api, state });
  // Other people's messages reported (R-Y175).
  const report = useReport({
    api,
    chat: state.current,
    onDone: selection.clear,
  });
  const messages = state.messages ?? [];
  // As the chat draws them: an album is one row, chosen with its items.
  const rows = groupAlbums(messages);
  const order = rows.map((m) => m.id);
  const chosen = () => expandAlbums(rows.filter((m) => selection.has(m.id)));
  const chat = state.current?.chat;

  const copySelected = () =>
    !chosen().some((m) => isProtected(m, state.current, state.info)) &&
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
      saveMessageGif: () => gifs.toggle(message),
      unsaveMessageGif: () => gifs.toggle(message),
      saveMessageMusic: () => saveMusic(message),
      copyLink: () => copy(linkOf(state, api, message), 'link-copied'),
      saveAs: () => saveMedia(api, chat, message, value === 'photo'),
      copyImage: () => copyImage(state, api, chat, message),
      pin: () => setPinning(message),
      unpin: () => send.pin(message, { unpin: true }),
      retractVote: () => send.poll('poll-vote', message, { options: [] }),
      stopPoll: () => setStopping(message),
      stopLive: () => send.stopLive(message),
      forward: () => setForwarding(expandAlbums([message])),
      delete: () => setDeleting(expandAlbums([message])),
      edit: () => state.composer.startEdit(message),
      select: () => selection.add(message.id),
      selectBulk: () => selectBulk(selection, message, order),
      copySelectedItems: copySelected,
      forwardSelected: () => setForwarding(chosen()),
      deleteSelected: () => setDeleting(chosen()),
      ...report.actions(message, chosen),
      unpinSelected: () => unpinAll(send, chosen()),
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
    act.gameScores = () => games.open(message);
    act.translate = () => translate.open(message);
    act.reactors = () => readers.open('reactors', message);
    return act[action]?.();
  };

  const lockedAny = chosen().some((m) =>
    isProtected(m, state.current, state.info)
  );
  const canForward = chosen().every((m) => !m.pending) && !lockedAny;
  const top = {
    count: selection.ids.length,
    canForward,
    ...report.top(chosen()),
    onClear: selection.clear,
    onForward: () => setForwarding(chosen()),
    onDelete: () => setDeleting(chosen()),
  };
  useSelectionKeys(selection, {
    onCopy: copySelected,
    onDelete: top.onDelete,
  });

  const keys = composerKeys(state, messages);

  const menuFor = (message, { selectedText, target } = {}) =>
    menuItems({
      message,
      chat: state.current ?? {},
      info: state.info,
      selectedText,
      target,
      gifs: gifs.ids,
      selection: {
        ids: selection.ids,
        has: selection.has,
        canForward,
        canCopy: !lockedAny,
        canReport: top.canReport,
        anyPinned: chosen().some((m) => m.raw?.pinned),
      },
      order,
    });

  const dialogs = dialogsOf({
    state,
    send,
    selection,
    open: { deleting, pinning, forwarding, stopping },
    close: { setDeleting, setPinning, setForwarding, setStopping },
    stage,
  });

  return {
    selection,
    onAction,
    menuFor,
    top,
    keys,
    // The state whose Send also forwards what waits (R-Y154).
    withForward: stage.wrap,
    dialogs: [
      ...dialogs,
      bots.dialog,
      webApp.dialog,
      comments.dialog,
      readers.dialog,
      games.dialog,
      translate.dialog,
      report.dialog,
    ],
  };
};
