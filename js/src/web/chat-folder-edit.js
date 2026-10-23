// Creating and editing chat folders, as Telegram Desktop's Settings →
// Folders and the folder tab's menu do (R-Y164; learned, never copied):
// the user's folders listed (Move up / Move down, Edit, Delete), "Create
// new folder", Telegram's recommended folders with "Add"; the editor with
// the name (12 letters at most), an icon, the kinds of chat a folder takes
// and leaves out, and chats picked by name; the tab's right-click menu
// (Edit folder, Delete folder behind the page's own confirmation,
// Reorder). Telegram's refusals show as words. After a change the
// folders are asked again at once, so the tabs follow.

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { FormDialog, Field, Picker } from './chat-create.js';
import { Frame } from './chat-readers.js';
import { useEsc } from './chat-invite.js';
import { watchFolders } from './chat-folder-live.js';
import { ColorRow, FolderTagsToggle } from './chat-folder-tags.js';
import { LeaveFolder, ShareFolder } from './chat-folder-share.js';
import { beginPinGesture } from './chat-pin-drag.js';
import {
  FOLDERS_CHANGED,
  ICONS,
  KINDS_IN,
  KINDS_OUT,
  TITLE_MAX,
  announceFolders,
  choicesOf,
  draftOf,
  draftProblem,
  errorKey,
  folderWrite,
  freshSuggestions,
  movedOrder,
  movedTo,
  requestOf,
  withPick,
} from './chat-folder-model.js';

const el = React.createElement;
const onBody = (node) =>
  typeof document === 'undefined' ? node : createPortal(node, document.body);

/** Telegram chats to pick from, loaded when `wanted`. */
export const useChatChoices = (api, wanted, given = null) => {
  const [loaded, setLoaded] = useState([]);
  useEffect(() => {
    if (!wanted || given) {
      return undefined;
    }
    let live = true;
    Promise.resolve()
      .then(() => (api.chatLinks ? api.chatLinks() : api.links()))
      .then(
        (links) => live && setLoaded(choicesOf(links ?? [])),
        () => {}
      );
    return () => {
      live = false;
    };
  }, [api, wanted, given]);
  return given ?? loaded;
};

/**
 * The user's folders and Telegram's recommended ones, asked now and again
 * whenever any part of the page changed them: `{ phase: 'loading' | 'ready'
 * | 'off', folders, suggested }`.
 */
export const useFolders = (api) => {
  const [state, setState] = useState({ phase: 'loading', folders: [] });
  const [suggested, setSuggested] = useState([]);
  const load = useCallback(() => {
    if (typeof api?.telegramFolders !== 'function') {
      setState({ phase: 'off', folders: [] });
      return () => {};
    }
    let live = true;
    api.telegramFolders({ fresh: true }).then(
      (a) =>
        live &&
        setState(
          a?.ok
            ? {
                phase: 'ready',
                folders: a.folders ?? [],
                tags: Boolean(a.tags),
              }
            : { phase: 'off', folders: [] }
        ),
      () => live && setState({ phase: 'off', folders: [] })
    );
    api.telegramFoldersSuggested?.().then(
      (a) => live && a?.ok && setSuggested(a.suggested ?? []),
      () => {}
    );
    return () => {
      live = false;
    };
  }, [api]);
  useEffect(() => {
    let stop = load();
    const again = () => {
      stop();
      stop = load();
    };
    globalThis.addEventListener?.(FOLDERS_CHANGED, again);
    // Changed on another device (R-Y172).
    const unwatch = watchFolders(api, again);
    return () => {
      stop();
      unwatch();
      globalThis.removeEventListener?.(FOLDERS_CHANGED, again);
    };
  }, [load]);
  return { ...state, suggested };
};

const Section = ({ t, side, draft, setDraft, chats }) => {
  const [open, setOpen] = useState(false);
  // A shared folder takes chats by name only (R-Y172): no kinds.
  const kinds = draft.chatlist ? [] : side === 'include' ? KINDS_IN : KINDS_OUT;
  return el('fieldset', { className: 'folder-section', 'data-section': side }, [
    el('legend', { key: 'l' }, t(`chat.folderEdit.${side}`)),
    ...kinds.map((kind) =>
      el('label', { key: kind, className: 'check' }, [
        el('input', {
          key: 'i',
          type: 'checkbox',
          'data-kind': kind,
          checked: draft[kind],
          onChange: () => setDraft((d) => ({ ...d, [kind]: !d[kind] })),
        }),
        ` ${t(`chat.folderEdit.kind.${kind}`)}`,
      ])
    ),
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'folder-choose',
        'data-action': `folder-choose-${side}`,
        'aria-expanded': open,
        onClick: () => setOpen(!open),
      },
      t('chat.folderEdit.chooseChats', { count: draft[side].length })
    ),
    open
      ? el(Picker, {
          key: 'p',
          contacts: chats.map((c) => ({ id: c.chat, name: c.name })),
          picked: new Set(draft[side]),
          toggle: (chat) => setDraft((d) => withPick(d, side, chat)),
          t,
          placeholder: t('chat.folderEdit.searchChats'),
          field: `${side}-chat`,
        })
      : null,
  ]);
};

const IconRow = ({ t, draft, setDraft }) =>
  el(
    'div',
    {
      className: 'folder-icons',
      role: 'group',
      'aria-label': t('chat.folderEdit.icon'),
    },
    [null, ...ICONS].map((icon) =>
      el(
        'button',
        {
          key: icon ?? 'none',
          type: 'button',
          className:
            draft.emoticon === icon ? 'folder-icon is-selected' : 'folder-icon',
          'data-icon': icon ?? '',
          'aria-pressed': draft.emoticon === icon,
          onClick: () => setDraft((d) => ({ ...d, emoticon: icon })),
        },
        icon ?? t('chat.folderEdit.noIcon')
      )
    )
  );

/** The editor for `folder` (null: a new one), over everything else. */
export const FolderEditor = ({ api, chats, folder = null, close }) => {
  const t = useT();
  const [draft, setDraft] = useState(() => draftOf(folder));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sharing, setSharing] = useState(false);
  const save = async () => {
    const problem = draftProblem(draft);
    if (problem) {
      setError(errorKey(t, problem));
      return;
    }
    await folderWrite(() => api.telegramFolderSave(requestOf(draft)), {
      t,
      setBusy,
      setError,
      close,
    });
  };
  return onBody(
    el(
      FormDialog,
      {
        name: 'folder-editor',
        title: t(
          folder ? 'chat.folderEdit.editTitle' : 'chat.folderEdit.newTitle'
        ),
        onClose: close,
        onSubmit: save,
        submit: t('chat.folderEdit.save'),
        busy,
        error,
      },
      [
        el(Field, {
          key: 'n',
          label: t('chat.folderEdit.name', { max: TITLE_MAX }),
          name: 'folder-title',
          value: draft.title,
          maxLength: TITLE_MAX,
          autoFocus: true,
          onChange: (event) =>
            setDraft((d) => ({ ...d, title: event.target.value })),
        }),
        el(IconRow, { key: 'i', t, draft, setDraft }),
        // The colour of the folder's tag (R-Y180).
        el(ColorRow, { key: 'col', draft, setDraft }),
        el(Section, { key: 'in', t, side: 'include', draft, setDraft, chats }),
        draft.chatlist
          ? null
          : el(Section, {
              key: 'out',
              t,
              side: 'exclude',
              draft,
              setDraft,
              chats,
            }),
        folder
          ? el(
              'button',
              {
                key: 'share',
                type: 'button',
                className: 'folder-share-btn',
                'data-action': 'folder-share',
                onClick: () => setSharing(true),
              },
              t('chat.folderShare.open')
            )
          : null,
        sharing
          ? el(ShareFolder, {
              key: 'share-dialog',
              api,
              folder,
              chats,
              close: () => setSharing(false),
            })
          : null,
      ]
    )
  );
};

/** "Delete folder?" in the page's own dialog. */
export const FolderDelete = ({ api, folder, close }) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const remove = async () => {
    await folderWrite(() => api.telegramFolderDelete({ id: folder.id }), {
      t,
      setBusy,
      setError,
      close,
    });
  };
  return onBody(
    el(
      FormDialog,
      {
        name: 'folder-delete',
        title: t('chat.folderEdit.deleteTitle'),
        onClose: close,
        onSubmit: remove,
        submit: t('chat.folderEdit.delete'),
        busy,
        error,
      },
      el(
        'p',
        { key: 'p' },
        t('chat.folderEdit.deleteAsk', { name: folder.title })
      )
    )
  );
};

const RowButton = ({ action, label, onClick, disabled = false }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'folder-row-btn',
      'data-action': action,
      disabled,
      onClick,
    },
    label
  );

const DRAG_ROWS = { list: '.folder-list', rows: '.folder-row[data-folder-id]' };

// A press on a row (not on its buttons) may become a drag (R-Y172).
const dragFrom = (act) => (event) => {
  if (
    event.target.closest?.('button, input') ||
    (event.pointerType === 'mouse' && event.button !== 0)
  ) {
    return;
  }
  beginPinGesture(event, event.currentTarget, act.drag, DRAG_ROWS);
};

const FolderRow = ({ t, folder, index, last, act }) =>
  el(
    'li',
    {
      className: 'folder-row',
      'data-folder-id': folder.id,
      onPointerDown: dragFrom(act),
    },
    [
      el(
        'span',
        { key: 'n', className: 'folder-row-name' },
        `${folder.emoticon ? `${folder.emoticon} ` : ''}${folder.title}`
      ),
      el(RowButton, {
        key: 'u',
        action: 'folder-up',
        label: t('chat.folderEdit.moveUp'),
        disabled: index === 0,
        onClick: () => act.move(folder, -1),
      }),
      el(RowButton, {
        key: 'd',
        action: 'folder-down',
        label: t('chat.folderEdit.moveDown'),
        disabled: last,
        onClick: () => act.move(folder, 1),
      }),
      el(RowButton, {
        key: 'e',
        action: 'folder-edit',
        label: t('chat.folderEdit.edit'),
        onClick: () => act.edit(folder),
      }),
      folder.chatlist
        ? el(RowButton, {
            key: 'x',
            action: 'folder-leave',
            label: t('chat.folderShare.leave'),
            onClick: () => act.leave(folder),
          })
        : el(RowButton, {
            key: 'x',
            action: 'folder-delete',
            label: t('chat.folderEdit.delete'),
            onClick: () => act.remove(folder),
          }),
    ]
  );

const Suggested = ({ t, items, add }) =>
  items.length === 0
    ? null
    : el('div', { className: 'folder-suggested' }, [
        el('h4', { key: 'h' }, t('chat.folderEdit.recommended')),
        el(
          'ul',
          { key: 'l', className: 'folder-list' },
          items.map((s) =>
            el(
              'li',
              {
                key: s.folder.title,
                className: 'folder-row',
                'data-suggested': s.folder.title,
              },
              [
                el('span', { key: 'n', className: 'folder-row-name' }, [
                  `${s.folder.title} `,
                  el('span', { key: 'd', className: 'meta' }, s.description),
                ]),
                el(RowButton, {
                  key: 'a',
                  action: 'folder-add-suggested',
                  label: t('chat.folderEdit.add'),
                  onClick: () => add(s),
                }),
              ]
            )
          )
        ),
      ]);

/** The folders listed, with everything that changes them. */
export const FolderManager = ({ api, data, chats: given = null }) => {
  const t = useT();
  const [editing, setEditing] = useState(undefined); // undefined: none
  const [deleting, setDeleting] = useState(null);
  const [leaving, setLeaving] = useState(null);
  const [error, setError] = useState(null);
  const chats = useChatChoices(
    api,
    editing !== undefined || leaving !== null,
    given
  );
  const named = data.folders.filter((f) => !f.all);
  const run = async (ask) => {
    setError(null);
    const answer = await ask().catch(() => null);
    if (answer?.ok) {
      announceFolders();
    } else {
      setError(errorKey(t, answer?.code ?? 'failed'));
    }
  };
  const act = {
    edit: setEditing,
    remove: setDeleting,
    leave: setLeaving,
    move: (folder, step) => {
      const order = movedOrder(data.folders, folder.id, step);
      return order && run(() => api.telegramFoldersReorder({ order }));
    },
    // Dragged from place `from` to place `to` (R-Y172).
    drag: (from, to) => {
      const order = movedTo(data.folders, from, to);
      return order && run(() => api.telegramFoldersReorder({ order }));
    },
  };
  const add = (s) =>
    run(() => api.telegramFolderSave(requestOf(draftOf(s.folder))));
  return el('div', { className: 'folder-manager' }, [
    el(
      'ul',
      { key: 'l', className: 'folder-list' },
      named.map((folder, i) =>
        el(FolderRow, {
          key: folder.id,
          t,
          folder,
          index: i,
          last: i === named.length - 1,
          act,
        })
      )
    ),
    named.length === 0
      ? el('p', { key: 'none', className: 'meta' }, t('chat.folderEdit.none'))
      : null,
    error
      ? el(
          'p',
          {
            key: 'e',
            className: 'chat-form-error',
            role: 'alert',
            'data-folder-error': '',
          },
          error
        )
      : null,
    el(
      'button',
      {
        key: 'c',
        type: 'button',
        className: 'primary',
        'data-action': 'folder-create',
        onClick: () => setEditing(null),
      },
      t('chat.folderEdit.create')
    ),
    el(Suggested, {
      key: 's',
      t,
      items: freshSuggestions(data.suggested, data.folders),
      add,
    }),
    editing !== undefined
      ? el(FolderEditor, {
          key: `edit-${editing?.id ?? 'new'}`,
          api,
          chats,
          folder: editing,
          close: () => setEditing(undefined),
        })
      : null,
    deleting
      ? el(FolderDelete, {
          key: 'del',
          api,
          folder: deleting,
          close: () => setDeleting(null),
        })
      : null,
    leaving
      ? el(LeaveFolder, {
          key: 'leave',
          api,
          folder: leaving,
          chats,
          close: () => setLeaving(null),
        })
      : null,
  ]);
};

/** Settings → Folders; nothing when the account is not Telegram's. */
export const FoldersSettings = ({ api }) => {
  const t = useT();
  const data = useFolders(api);
  if (data.phase === 'off') {
    return null;
  }
  return el(
    'section',
    {
      className: 'card folder-settings',
      'aria-labelledby': 'folder-settings-title',
    },
    [
      el(
        'h3',
        { key: 'h', id: 'folder-settings-title' },
        t('chat.folderEdit.title')
      ),
      el('p', { key: 'p', className: 'meta' }, t('chat.folderEdit.intro')),
      data.phase === 'ready'
        ? el(FolderTagsToggle, { key: 'tg', api, enabled: data.tags })
        : null,
      data.phase === 'ready'
        ? el(FolderManager, { key: 'm', api, data })
        : el(
            'p',
            { key: 'w', className: 'meta' },
            t('chat.folderEdit.loading')
          ),
    ]
  );
};

const ReorderFrame = ({ tools, close }) => {
  const t = useT();
  const data = useFolders(tools.api);
  return onBody(
    el(
      Frame,
      { title: t('chat.folderEdit.title'), close, name: 'folders-reorder' },
      data.phase === 'ready'
        ? el(FolderManager, { api: tools.api, data, chats: tools.chats })
        : el('p', { className: 'meta' }, t('chat.folderEdit.loading'))
    )
  );
};

const MenuItem = ({ action, label, onClick }) =>
  el(
    'button',
    {
      type: 'button',
      role: 'menuitem',
      className: 'folder-menu-item',
      'data-action': action,
      onClick,
    },
    label
  );

const TabMenu = ({ t, menu, folder, pick, close }) => {
  useEsc(close);
  useEffect(() => {
    const away = (event) => {
      if (!event.target.closest?.('.folder-menu')) {
        close();
      }
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [close]);
  return onBody(
    el(
      'div',
      {
        className: 'folder-menu',
        role: 'menu',
        'aria-label': t('chat.folderEdit.menu'),
        style: { left: menu.x, top: menu.y },
      },
      [
        el(MenuItem, {
          key: 'e',
          action: 'folder-menu-edit',
          label: t('chat.folderEdit.editFolder'),
          onClick: () => pick('edit'),
        }),
        folder.chatlist
          ? el(MenuItem, {
              key: 'd',
              action: 'folder-menu-leave',
              label: t('chat.folderShare.leaveFolder'),
              onClick: () => pick('leave'),
            })
          : el(MenuItem, {
              key: 'd',
              action: 'folder-menu-delete',
              label: t('chat.folderEdit.deleteFolder'),
              onClick: () => pick('delete'),
            }),
        el(MenuItem, {
          key: 'r',
          action: 'folder-menu-reorder',
          label: t('chat.folderEdit.reorder'),
          onClick: () => pick('reorder'),
        }),
      ]
    )
  );
};

/**
 * The folder tab's menu where it was right-clicked (`menu`: `{ id, x, y }`)
 * and the dialog each choice opens; `tools`: `{ api, folders, chats }`.
 */
export const FolderTabMenu = ({ tools, menu, close }) => {
  const t = useT();
  const [stage, setStage] = useState('menu');
  const folder = tools.folders.find((f) => f.id === menu.id);
  if (!folder) {
    return null;
  }
  if (stage === 'edit') {
    return el(FolderEditor, {
      api: tools.api,
      chats: tools.chats,
      folder,
      close,
    });
  }
  if (stage === 'delete') {
    return el(FolderDelete, { api: tools.api, folder, close });
  }
  if (stage === 'leave') {
    return el(LeaveFolder, {
      api: tools.api,
      folder,
      chats: tools.chats,
      close,
    });
  }
  if (stage === 'reorder') {
    return el(ReorderFrame, { tools, close });
  }
  return el(TabMenu, { t, menu, folder, pick: setStage, close });
};

const TAB_DRAG = {
  list: '.chat-filters',
  rows: '.chat-filter[data-folder-tab]',
  axis: 'x',
};

/**
 * A press on a folder tab may become a drag sideways (R-Y172): dropped, the
 * folders are put in the new order (`tools`: the tab menu's, or null).
 */
export const tabDragStart = (tools) => (event) => {
  if (!tools || (event.pointerType === 'mouse' && event.button !== 0)) {
    return;
  }
  beginPinGesture(
    event,
    event.currentTarget,
    (from, to) => {
      const order = movedTo(tools.folders, from, to);
      if (order) {
        Promise.resolve(tools.api.telegramFoldersReorder({ order })).then(
          announceFolders,
          announceFolders
        );
      }
    },
    TAB_DRAG
  );
};
