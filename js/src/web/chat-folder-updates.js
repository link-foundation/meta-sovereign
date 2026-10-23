// New chats in a shared folder, as Telegram Desktop shows them (R-Y211;
// learned, never copied): a folder the user added from an invite link is
// asked now and then what its owner has added since (chatlists.
// getChatlistUpdates). The folder's tab carries "+N", and with the folder
// open a bar says "N new chats" with "View" (a dialog with a check for each
// chat: Join chats) and "Hide" (the notice put away). Nothing is joined
// until the button is pressed.

import React, { useEffect, useMemo, useState } from 'react';
import { useT } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { ChatChecks } from './chat-folder-share.js';
import {
  FOLDERS_CHANGED,
  announceFolders,
  errorKey,
  folderWrite,
} from './chat-folder-model.js';

const el = React.createElement;

export const UPDATES_REFRESH_MS = 10 * 60_000;

/** The folders to ask about: joined from a link, not the user's own links. */
export const updatableFolders = (folders = []) =>
  folders.filter((f) => f.chatlist && !f.hasMyInvites && !f.all);

/** The folder id a tab's key (`folder:7`) names, or null. */
export const folderIdOfKey = (key) => {
  const id = /^folder:(\d+)$/.exec(String(key ?? ''))?.[1];
  return id ? Number(id) : null;
};

/**
 * `{ byFolder, reload, drop }` — `byFolder`: folder id → the new chats
 * `[{ chat, name }]` (only folders that have some); `drop(id)` forgets a
 * folder's notice now; asked when the folders change and every ten minutes.
 */
export const useChatlistUpdates = (api, folders) => {
  const [byFolder, setByFolder] = useState(() => new Map());
  const ids = updatableFolders(folders).map((f) => f.id);
  const key = ids.join(',');
  const [tick, setTick] = useState(0);
  const enabled = typeof api?.telegramChatlistUpdates === 'function';
  useEffect(() => {
    if (!enabled || ids.length === 0) {
      setByFolder(new Map());
      return undefined;
    }
    let live = true;
    const load = () =>
      Promise.all(
        ids.map((id) =>
          Promise.resolve(api.telegramChatlistUpdates({ id }))
            .then((a) => [id, a?.ok ? (a.chats ?? []) : []])
            .catch(() => [id, []])
        )
      ).then((rows) => {
        if (live) {
          setByFolder(new Map(rows.filter(([, chats]) => chats.length > 0)));
        }
      });
    load();
    const timer = globalThis.setInterval(load, UPDATES_REFRESH_MS);
    return () => {
      live = false;
      globalThis.clearInterval(timer);
    };
  }, [api, enabled, key, tick]);
  useEffect(() => {
    const on = () => setTick((n) => n + 1);
    globalThis.addEventListener?.(FOLDERS_CHANGED, on);
    return () => globalThis.removeEventListener?.(FOLDERS_CHANGED, on);
  }, []);
  return useMemo(
    () => ({
      api,
      byFolder,
      reload: () => setTick((n) => n + 1),
      drop: (id) =>
        setByFolder((before) => {
          const next = new Map(before);
          next.delete(id);
          return next;
        }),
    }),
    [api, byFolder]
  );
};

const UpdatesDialog = ({ updates, folder, chats, close }) => {
  const t = useT();
  const [picked, setPicked] = useState(() => new Set(chats.map((c) => c.chat)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const finish = () => {
    updates.drop(folder.id);
    close();
  };
  const toggle = (chat) =>
    setPicked((before) => {
      const next = new Set(before);
      if (!next.delete(chat)) {
        next.add(chat);
      }
      return next;
    });
  const hide = async () => {
    setBusy(true);
    const answer = await Promise.resolve(
      updates.api.telegramChatlistUpdatesHide({ id: folder.id })
    ).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      finish();
    } else {
      setError(errorKey(t, answer?.code ?? 'failed'));
    }
  };
  return el(
    FormDialog,
    {
      name: 'folder-updates',
      title: t('chat.folderUpdates.title', { name: folder.title }),
      submit: t('chat.folderUpdates.join'),
      onClose: close,
      onSubmit: () =>
        picked.size > 0 &&
        folderWrite(
          () =>
            updates.api.telegramChatlistUpdatesJoin({
              id: folder.id,
              chats: [...picked],
            }),
          { t, setBusy, setError, close: finish }
        ),
      busy: busy || picked.size === 0,
      error,
    },
    [
      el(
        'p',
        { key: 'p', className: 'meta' },
        t('chat.folderUpdates.count', { count: chats.length })
      ),
      el(ChatChecks, {
        key: 'c',
        items: chats,
        picked,
        field: 'update-chat',
        toggle,
      }),
      el(
        'button',
        {
          key: 'h',
          type: 'button',
          'data-action': 'folder-updates-hide',
          disabled: busy,
          onClick: hide,
        },
        t('chat.folderUpdates.hide')
      ),
    ]
  );
};

/**
 * Under the folder tabs, with a shared folder open that has new chats: "N
 * new chats", View and Hide. Nothing otherwise.
 */
export const FolderUpdatesBar = ({ state }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const updates = state.folderUpdates;
  const id = folderIdOfKey(state.filter);
  const chats = id ? updates?.byFolder.get(id) : null;
  const folder = (state.folders ?? []).find((f) => f.id === id);
  if (!updates || !chats || !folder) {
    return null;
  }
  const hide = async () => {
    const answer = await Promise.resolve(
      updates.api.telegramChatlistUpdatesHide({ id })
    ).catch(() => null);
    if (answer?.ok) {
      updates.drop(id);
      announceFolders();
    }
  };
  return el(
    'div',
    {
      className: 'folder-updates-bar',
      role: 'status',
      'data-folder-updates': String(id),
    },
    [
      el(
        'button',
        {
          key: 'v',
          type: 'button',
          className: 'folder-updates-view',
          'data-action': 'folder-updates-view',
          onClick: () => setOpen(true),
        },
        t('chat.folderUpdates.count', { count: chats.length })
      ),
      el(
        'button',
        {
          key: 'x',
          type: 'button',
          className: 'folder-updates-hide',
          'data-action': 'folder-updates-dismiss',
          'aria-label': t('chat.folderUpdates.hide'),
          title: t('chat.folderUpdates.hide'),
          onClick: hide,
        },
        '×'
      ),
      open
        ? el(UpdatesDialog, {
            key: 'd',
            updates,
            folder,
            chats,
            close: () => setOpen(false),
          })
        : null,
    ]
  );
};
