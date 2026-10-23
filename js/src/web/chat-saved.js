// Saved Messages by the chat they came from (R-Y143; learned, never
// copied). In the user's own chat a header button switches between "View
// as messages" (the chat as it is) and "View as chats": a list of the
// chats the saved messages were forwarded from (avatar, name, the newest
// saved one and its date), paged. A click opens what was saved from that
// chat, drawn with the chat's own message bubbles, read only; "Back" goes
// to the list, and the trash deletes all of it, after an in-page
// confirmation. Each chat can be pinned (Pin / Unpin; pinned ones come
// first with a pin icon, R-Y174). Telegram's refusals are told as text.
//
// The sub-chat is a plain list of rendered messages, not the whole chat
// screen: it has no composer, selection or context menu.

import React, { useCallback, useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Icon } from './icons.js';
import { PeerAvatar } from './peer-avatar.js';
import { MessageBubble } from './chat-message.js';
import { networkMessageId } from './chat-model.js';
import { useEsc } from './chat-invite.js';

const el = React.createElement;

/** Whether the chat is the user's Saved Messages (the server says so). */
export const isSavedChat = (chat, info) =>
  chat?.source === 'telegram' && Boolean(info?.self);

/** The view switch of the open chat: `{ available, on, toggle }`. */
export const useSavedView = (chat, info) => {
  const key = chat?.key ?? null;
  const [view, setView] = useState({ key: null, on: false });
  const available = isSavedChat(chat, info);
  return {
    available,
    on: available && view.key === key && view.on,
    toggle: () =>
      setView((old) => ({ key, on: old.key === key ? !old.on : true })),
  };
};

/** The header button that switches the view. */
export const SavedToggle = ({ saved }) => {
  const t = useT();
  if (!saved?.available) {
    return null;
  }
  const label = t(saved.on ? 'chat.saved.asMessages' : 'chat.saved.asChats');
  return el(
    'button',
    {
      type: 'button',
      className: saved.on ? 'chat-saved-view icon-btn active' : 'icon-btn',
      'data-action': 'saved-view',
      'aria-pressed': saved.on,
      'aria-label': label,
      title: label,
      onClick: saved.toggle,
    },
    el(Icon, { name: 'menu' })
  );
};

const errorText = (t, code) => {
  const key = `chat.saved.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.saved.err.failed') : text;
};

const Failed = ({ t, code }) =>
  code
    ? el(
        'p',
        {
          className: 'comments-failed',
          role: 'alert',
          'data-saved-error': code,
        },
        errorText(t, code)
      )
    : null;

// What a saved message holds when it has no words.
const previewOf = (t, dialog) =>
  dialog.preview || (dialog.media ? t(`chat.saved.media.${dialog.media}`) : '');

// The dialogs by page: `load()` the first, `load(next)` the following.
const useDialogs = (api) => {
  const [state, setState] = useState({ phase: 'loading', items: [] });
  const load = useCallback(
    async (cursor = null) => {
      setState((old) => ({ ...old, phase: 'loading', code: null }));
      const answer = await api
        .telegramSavedDialogs(cursor ?? {})
        .catch(() => null);
      setState((old) =>
        answer?.ok
          ? {
              phase: 'ready',
              items: [...(cursor ? old.items : []), ...answer.dialogs],
              next: answer.next ?? null,
            }
          : { ...old, phase: 'error', code: answer?.code ?? 'failed' }
      );
    },
    [api]
  );
  useEffect(() => {
    load();
  }, [load]);
  return [state, load];
};

// Pinned chats first, in the order Telegram gave them (R-Y174).
export const pinnedFirst = (items) => [
  ...items.filter((d) => d.pinned),
  ...items.filter((d) => !d.pinned),
];

const PinButton = ({ dialog, onPin, t }) => {
  const label = t(dialog.pinned ? 'chat.saved.unpin' : 'chat.saved.pin');
  return el(
    'button',
    {
      type: 'button',
      className: 'icon-btn saved-pin',
      'data-action': dialog.pinned ? 'saved-unpin' : 'saved-pin',
      'data-saved-pin': dialog.peer,
      'aria-label': label,
      title: label,
      onClick: () => onPin(dialog),
    },
    el(Icon, { name: 'pin', size: 14 })
  );
};

const DialogRow = ({ api, dialog, onOpen, onPin, t, dates }) => {
  const name = dialog.name || t('chat.saved.unknown');
  return el(
    'li',
    {
      className: `saved-dialog-item${dialog.pinned ? ' is-pinned' : ''}`,
      'data-saved-pinned': dialog.pinned ? 'true' : 'false',
    },
    el(
      'button',
      {
        type: 'button',
        className: 'saved-dialog',
        'data-saved-peer': dialog.peer,
        onClick: () => onOpen(dialog),
      },
      [
        el(PeerAvatar, {
          key: 'a',
          api,
          source: 'telegram',
          peer: dialog.peer,
          name,
          size: 's',
        }),
        el('span', { key: 'b', className: 'saved-dialog-body' }, [
          el('strong', { key: 'n', className: 'saved-dialog-name' }, name),
          el(
            'span',
            { key: 'p', className: 'meta saved-dialog-preview' },
            previewOf(t, dialog)
          ),
        ]),
        dialog.date
          ? el(
              'span',
              { key: 'd', className: 'meta saved-dialog-date' },
              dates.chatTime(new Date(dialog.date).toISOString())
            )
          : null,
        dialog.pinned
          ? el(
              'span',
              { key: 'p', className: 'saved-pinned-mark' },
              el(Icon, { name: 'pin', size: 12 })
            )
          : null,
      ]
    ),
    el(PinButton, { dialog, onPin, t })
  );
};

const DialogList = ({ api, onOpen }) => {
  const t = useT();
  const dates = useDates();
  const [state, load] = useDialogs(api);
  const [pinCode, setPinCode] = useState(null);
  // Pin or Unpin: Telegram first, then the list is read again so the
  // pinned ones show first (R-Y174).
  const pin = async (dialog) => {
    setPinCode(null);
    const answer = await api
      .telegramSavedPin({ peer: dialog.peer, pinned: !dialog.pinned })
      .catch(() => null);
    if (answer?.ok) {
      await load();
    } else {
      setPinCode(answer?.code ?? 'failed');
    }
  };
  const empty = state.phase === 'ready' && state.items.length === 0;
  return el('div', { className: 'saved-list', 'data-saved': 'chats' }, [
    state.items.length > 0
      ? el(
          'ul',
          { key: 'l', className: 'saved-dialogs' },
          pinnedFirst(state.items).map((dialog) =>
            el(DialogRow, {
              key: dialog.peer,
              api,
              dialog,
              onOpen,
              onPin: pin,
              t,
              dates,
            })
          )
        )
      : null,
    state.phase === 'loading'
      ? el('p', { key: 's', className: 'meta' }, t('chat.saved.loading'))
      : null,
    empty
      ? el('p', { key: 'e', className: 'meta' }, t('chat.saved.empty'))
      : null,
    el(Failed, {
      key: 'f',
      t,
      code: (state.phase === 'error' && state.code) || pinCode,
    }),
    state.next && state.phase !== 'loading'
      ? el(
          'button',
          {
            key: 'm',
            type: 'button',
            className: 'comments-older',
            'data-action': 'saved-more',
            onClick: () => load(state.next),
          },
          t('chat.saved.more')
        )
      : null,
  ]);
};

// The messages saved from one chat, newest page first; older on demand.
const useSavedMessages = (api, chat, peer) => {
  const [state, setState] = useState({ phase: 'loading', messages: [] });
  const load = useCallback(
    async (before = null) => {
      const answer = await api
        .telegramSavedHistory({
          chat: String(chat),
          peer,
          ...(before ? { before } : {}),
        })
        .catch(() => null);
      setState((old) => {
        if (!answer?.ok) {
          return {
            ...old,
            phase: 'error',
            code: answer?.code ?? 'failed',
          };
        }
        const byId = new Map(
          [...(before ? old.messages : []), ...answer.messages].map((m) => [
            m.id,
            m,
          ])
        );
        const messages = [...byId.values()].sort(
          (a, b) => (networkMessageId(a) ?? 0) - (networkMessageId(b) ?? 0)
        );
        return { phase: 'ready', messages, complete: answer.complete };
      });
    },
    [api, chat, peer]
  );
  useEffect(() => {
    setState({ phase: 'loading', messages: [] });
    load();
  }, [load]);
  return [state, load];
};

const DeleteConfirm = ({ busy, code, name, onYes, onClose }) => {
  const t = useT();
  useEsc(onClose);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.saved.deleteTitle'),
      'data-dialog': 'saved-delete',
    },
    el('div', { className: 'delete-dialog' }, [
      el('h3', { key: 'h' }, t('chat.saved.deleteTitle')),
      el('p', { key: 'p' }, t('chat.saved.deleteBody', { name })),
      el(Failed, { key: 'e', t, code }),
      el('div', { key: 'b', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'n',
            type: 'button',
            'data-action': 'cancel',
            onClick: onClose,
          },
          t('chat.invite.cancel')
        ),
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: 'danger',
            'data-action': 'saved-delete-confirm',
            disabled: busy,
            onClick: onYes,
          },
          t('chat.saved.delete')
        ),
      ]),
    ])
  );
};

const SubChatHead = ({ name, onBack, onDelete, t }) =>
  el('div', { className: 'saved-head' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'icon-btn',
        'data-action': 'saved-back',
        'aria-label': t('chat.saved.back'),
        title: t('chat.saved.back'),
        onClick: onBack,
      },
      el(Icon, { name: 'back' })
    ),
    el('strong', { key: 'n', className: 'saved-head-name' }, name),
    el(
      'button',
      {
        key: 'd',
        type: 'button',
        className: 'icon-btn',
        'data-action': 'saved-delete',
        'aria-label': t('chat.saved.delete'),
        title: t('chat.saved.delete'),
        onClick: onDelete,
      },
      el(Icon, { name: 'trash' })
    ),
  ]);

/** Saved messages drawn with the chat's own bubbles, read only. */
export const savedBubbles = (api, list) => {
  const msgById = new Map(list.map((m) => [m.id, m]));
  return list.map((message, i) =>
    el(MessageBubble, {
      key: message.id,
      message,
      isPersonal: true,
      showName: false,
      showAvatar: false,
      run: {
        first: list[i - 1]?.sender !== message.sender,
        last: list[i + 1]?.sender !== message.sender,
      },
      msgById,
      api,
    })
  );
};

const SubChat = ({ api, chat, dialog, onBack }) => {
  const t = useT();
  const name = dialog.name || t('chat.saved.unknown');
  const [state, load] = useSavedMessages(api, chat, dialog.peer);
  const [asking, setAsking] = useState(false);
  const [removal, setRemoval] = useState({ busy: false, code: null });
  const remove = async () => {
    setRemoval({ busy: true, code: null });
    const answer = await api
      .telegramSavedDelete({ peer: dialog.peer })
      .catch(() => null);
    if (answer?.ok) {
      onBack();
    } else {
      setRemoval({ busy: false, code: answer?.code ?? 'failed' });
    }
  };
  const list = state.messages;
  return el('div', { className: 'saved-sub', 'data-saved': 'messages' }, [
    el(SubChatHead, {
      key: 'h',
      name,
      onBack,
      onDelete: () => setAsking(true),
      t,
    }),
    el('div', { key: 's', className: 'comments-scroll' }, [
      el('div', { key: 'c', className: 'chat-column comments-column' }, [
        state.phase === 'ready' && !state.complete && list.length > 0
          ? el(
              'button',
              {
                key: 'older',
                type: 'button',
                className: 'comments-older',
                'data-action': 'saved-older',
                onClick: () => load(networkMessageId(list[0])),
              },
              t('chat.saved.older')
            )
          : null,
        state.phase === 'loading'
          ? el('p', { key: 'l', className: 'meta' }, t('chat.saved.loading'))
          : null,
        state.phase === 'ready' && list.length === 0
          ? el('p', { key: 'e', className: 'meta' }, t('chat.saved.emptyChat'))
          : null,
        el(Failed, {
          key: 'f',
          t,
          code: state.phase === 'error' && state.code,
        }),
        ...savedBubbles(api, list),
      ]),
    ]),
    asking
      ? el(DeleteConfirm, {
          key: 'd',
          busy: removal.busy,
          code: removal.code,
          name,
          onYes: remove,
          onClose: () => setAsking(false),
        })
      : null,
  ]);
};

/** The Saved Messages "as chats" view, in place of the message stream. */
export const SavedChats = ({ api, chat }) => {
  const [open, setOpen] = useState(null);
  return el(
    'div',
    { className: 'saved-view' },
    open
      ? el(SubChat, {
          api,
          chat: chat.chat,
          dialog: open,
          onBack: () => setOpen(null),
        })
      : el(DialogList, { api, onOpen: setOpen })
  );
};
