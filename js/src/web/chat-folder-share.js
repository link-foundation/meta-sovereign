// Shared folders, chat lists, as Telegram Desktop has them (R-Y172; learned,
// never copied):
// - "Share folder" in the folder editor: the folder's links listed (Copy,
//   Edit, Delete) and a new link made for chosen groups and channels of the
//   folder;
// - a t.me/addlist/<slug> link in a message opens a preview (the folder's
//   name and its chats) with "Add folder" or, for a folder the user already
//   has, "Join chats" with the new chats marked. Nothing is joined until
//   that button is pressed;
// - "Leave folder" asks which chats to leave as well.
// Telegram's refusals show as words.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { FormDialog, Field } from './chat-create.js';
import { Frame } from './chat-readers.js';
import {
  announceFolders,
  eligibleChats,
  errorKey,
  folderWrite,
  shareProblem,
} from './chat-folder-model.js';

const el = React.createElement;
const onBody = (node) =>
  typeof document === 'undefined' ? node : createPortal(node, document.body);
const LINK_TITLE_MAX = 32;

const toggled = (set, chat) => {
  const next = new Set(set);
  if (next.has(chat)) {
    next.delete(chat);
  } else {
    next.add(chat);
  }
  return next;
};

/** Chats with a check each: `items` are `{ chat, name, note?, locked? }`. */
export const ChatChecks = ({ items, picked, toggle, field }) =>
  el(
    'ul',
    { className: 'chat-pick-list', 'data-checks': field },
    items.map((item) =>
      el(
        'li',
        { key: item.chat },
        el('label', { className: 'chat-pick-row' }, [
          el('input', {
            key: 'c',
            type: 'checkbox',
            [`data-${field}`]: item.chat,
            checked: item.locked ? true : picked.has(item.chat),
            disabled: Boolean(item.locked),
            onChange: () => toggle(item.chat),
          }),
          el('span', { key: 'n' }, item.name),
          item.note
            ? el('span', { key: 'm', className: 'meta' }, item.note)
            : null,
        ])
      )
    )
  );

const ErrorLine = ({ text }) =>
  text
    ? el(
        'p',
        { className: 'chat-form-error', role: 'alert', 'data-share-error': '' },
        text
      )
    : null;

// ---- Share folder -------------------------------------------------------

const useInvites = (api, folder) => {
  const [state, setState] = useState({ phase: 'loading', invites: [] });
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let live = true;
    api.telegramChatlistInvites({ id: folder.id }).then(
      (a) =>
        live &&
        setState({
          phase: 'ready',
          // A folder never shared has no links to list.
          invites: a?.ok ? (a.invites ?? []) : [],
          names: a?.ok ? (a.chats ?? []) : [],
        }),
      () => live && setState({ phase: 'ready', invites: [] })
    );
    return () => {
      live = false;
    };
  }, [api, folder.id, again]);
  return [state, () => setAgain((n) => n + 1)];
};

const LinkForm = ({ t, items, initial, submit, onSubmit, onCancel, busy }) => {
  const [title, setTitle] = useState(initial.title);
  const [picked, setPicked] = useState(() => new Set(initial.chats));
  return el('div', { className: 'share-form', 'data-share-form': '' }, [
    el(Field, {
      key: 'n',
      label: t('chat.folderShare.linkName'),
      name: 'share-title',
      value: title,
      maxLength: LINK_TITLE_MAX,
      onChange: (event) => setTitle(event.target.value),
    }),
    el('span', { key: 'l', className: 'meta' }, t('chat.folderShare.chats')),
    el(ChatChecks, {
      key: 'c',
      items,
      picked,
      field: 'share-chat',
      toggle: (chat) => setPicked((p) => toggled(p, chat)),
    }),
    el('div', { key: 'b', className: 'share-form-btns' }, [
      onCancel
        ? el(
            'button',
            {
              key: 'x',
              type: 'button',
              'data-action': 'share-cancel',
              onClick: onCancel,
            },
            t('chat.create.cancel')
          )
        : null,
      el(
        'button',
        {
          key: 's',
          type: 'button',
          className: 'primary',
          'data-action': 'share-submit',
          disabled: busy || picked.size === 0,
          onClick: () => onSubmit({ title: title.trim(), chats: [...picked] }),
        },
        submit
      ),
    ]),
  ]);
};

const LinkRow = ({ t, link, names, act, state }) => {
  const label = (id) => names.get(id) ?? id;
  return el('li', { className: 'share-link', 'data-slug': link.slug }, [
    el('div', { key: 'u', className: 'share-link-main' }, [
      link.title
        ? el('strong', { key: 't', className: 'share-link-title' }, link.title)
        : null,
      el('code', { key: 'c', className: 'share-link-url' }, link.url),
      el(
        'span',
        { key: 'n', className: 'meta' },
        t('chat.folderShare.chatsCount', { count: link.chats.length }) +
          (link.chats.length > 0 ? `: ${link.chats.map(label).join(', ')}` : '')
      ),
    ]),
    el('div', { key: 'b', className: 'share-link-btns' }, [
      el(
        'button',
        {
          key: 'cp',
          type: 'button',
          'data-action': 'share-copy',
          onClick: () => act.copy(link),
        },
        state.copied === link.slug
          ? t('chat.folderShare.copied')
          : t('chat.folderShare.copy')
      ),
      el(
        'button',
        {
          key: 'e',
          type: 'button',
          'data-action': 'share-edit',
          onClick: () => act.edit(link.slug),
        },
        t('chat.folderEdit.edit')
      ),
      el(
        'button',
        {
          key: 'd',
          type: 'button',
          className: state.confirming === link.slug ? 'danger' : undefined,
          'data-action':
            state.confirming === link.slug
              ? 'share-delete-confirm'
              : 'share-delete',
          onClick: () => act.remove(link),
        },
        state.confirming === link.slug
          ? t('chat.folderShare.confirmDelete')
          : t('chat.folderEdit.delete')
      ),
    ]),
  ]);
};

// The chats a link could carry: the folder's, and what the link has.
const itemsFor = (eligible, names, link) => {
  const items = new Map(eligible.map((e) => [e.chat, e]));
  for (const chat of link?.chats ?? []) {
    items.set(chat, items.get(chat) ?? { chat, name: names.get(chat) ?? chat });
  }
  return [...items.values()];
};

const useShareActions = ({ api, folder, reload, setError, t }) => {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState({ editing: null, confirming: null });
  const [copied, setCopied] = useState(null);
  const run = async (ask) => {
    setBusy(true);
    setError(null);
    const answer = await ask().catch(() => null);
    setBusy(false);
    if (!answer?.ok) {
      setError(errorKey(t, answer?.code ?? 'failed'));
      return false;
    }
    announceFolders();
    reload();
    return true;
  };
  const act = {
    copy: (link) =>
      Promise.resolve(globalThis.navigator?.clipboard?.writeText(link.url))
        .then(() => setCopied(link.slug))
        .catch(() => {}),
    edit: (slug) => setState({ editing: slug, confirming: null }),
    remove: async (link) => {
      if (state.confirming !== link.slug) {
        setState({ editing: null, confirming: link.slug });
        return;
      }
      setState({ editing: null, confirming: null });
      await run(() =>
        api.telegramChatlistInviteDelete({ id: folder.id, slug: link.slug })
      );
    },
    create: ({ title, chats }) =>
      run(() =>
        api.telegramChatlistExport({
          id: folder.id,
          ...(title ? { title } : {}),
          chats,
        })
      ),
    save: (slug, { title, chats }) =>
      run(() =>
        api.telegramChatlistInviteEdit({ id: folder.id, slug, title, chats })
      ).then((ok) => ok && setState({ editing: null, confirming: null })),
    cancel: () => setState({ editing: null, confirming: null }),
  };
  return { act, busy, state: { ...state, copied } };
};

/** "Share folder": the folder's links and a new one, over everything. */
export const ShareFolder = ({ api, folder, chats = [], close }) => {
  const t = useT();
  const [data, reload] = useInvites(api, folder);
  const [error, setError] = useState(null);
  const { act, busy, state } = useShareActions({
    api,
    folder,
    reload,
    setError,
    t,
  });
  const problem = shareProblem(folder);
  const eligible = eligibleChats(folder, chats);
  const names = new Map([
    ...chats.map((c) => [c.chat, c.name]),
    ...(data.names ?? []).map((c) => [c.chat, c.name]),
  ]);
  let body;
  if (problem) {
    body = el(
      'p',
      { className: 'meta', 'data-share-problem': problem },
      t(`chat.folderShare.cannot.${problem}`)
    );
  } else if (data.phase === 'loading') {
    body = el('p', { className: 'meta' }, t('chat.folderEdit.loading'));
  } else {
    body = [
      el('p', { key: 'i', className: 'meta' }, t('chat.folderShare.intro')),
      el(
        'ul',
        { key: 'l', className: 'share-links', 'data-share-links': '' },
        data.invites.map((link) =>
          state.editing === link.slug
            ? el(
                'li',
                {
                  key: link.slug,
                  className: 'share-link',
                  'data-slug': link.slug,
                },
                el(LinkForm, {
                  t,
                  items: itemsFor(eligible, names, link),
                  initial: { title: link.title, chats: link.chats },
                  submit: t('chat.folderEdit.save'),
                  busy,
                  onCancel: act.cancel,
                  onSubmit: (v) => act.save(link.slug, v),
                })
              )
            : el(LinkRow, { key: link.slug, t, link, names, act, state })
        )
      ),
      data.invites.length === 0
        ? el('p', { key: 'n', className: 'meta' }, t('chat.folderShare.none'))
        : null,
      el('h4', { key: 'h' }, t('chat.folderShare.newLink')),
      el(LinkForm, {
        key: `new-${data.invites.length}`,
        t,
        items: eligible,
        initial: { title: '', chats: eligible.map((e) => e.chat) },
        submit: t('chat.folderShare.create'),
        busy,
        onSubmit: act.create,
      }),
    ];
  }
  return onBody(
    el(
      Frame,
      { title: t('chat.folderShare.title'), close, name: 'folder-share' },
      [body, el(ErrorLine, { key: 'e', text: error })]
    )
  );
};

// ---- A shared folder's link ---------------------------------------------

const EVENT = 'ms-addlist-open';

/** Asks the dialog (mounted once, in the app) to open for `slug`. */
export const openAddlist = (slug) =>
  globalThis.dispatchEvent?.(new CustomEvent(EVENT, { detail: { slug } }));

// What the link leads to, asked once; nothing is joined.
const useAddlist = (api, slug) => {
  const [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    let live = true;
    const done = (next) => live && setState(next);
    api.telegramChatlistCheck({ slug }).then(
      async (a) => {
        if (!a?.ok) {
          done({ phase: 'error', code: a?.code ?? 'failed' });
          return;
        }
        // A folder the user has already: its own name.
        const own = a.already
          ? await api
              .telegramFolders?.()
              .then((r) => r?.folders?.find((f) => f.id === a.folderId))
              .catch(() => null)
          : null;
        done({ phase: 'ready', view: { ...a, title: own?.title ?? a.title } });
      },
      () => done({ phase: 'error', code: 'failed' })
    );
    return () => {
      live = false;
    };
  }, [api, slug]);
  return state;
};

// What each chat of the link shows: joined ones locked, new ones marked.
const addlistItems = (view, t) =>
  view.chats.map((c) => {
    let note = '';
    if (c.joined) {
      note = t('chat.folderShare.joined');
    } else if (view.already) {
      note = t('chat.folderShare.new');
    }
    return { chat: c.chat, name: c.name, locked: c.joined, note };
  });

const AddlistBody = ({ t, state, chosen, setPicked }) => {
  if (state.phase === 'error') {
    return el(
      'p',
      {
        className: 'invite-error',
        role: 'alert',
        'data-addlist-error': state.code,
      },
      errorKey(t, state.code)
    );
  }
  const view = state.view;
  if (!view) {
    return el('p', { className: 'meta' }, t('chat.invite.loading'));
  }
  return [
    el(
      'strong',
      { key: 't', className: 'invite-title', 'data-addlist-title': '' },
      `${view.emoticon ? `${view.emoticon} ` : ''}${view.title}`
    ),
    el(
      'p',
      { key: 'p', className: 'meta' },
      view.already
        ? t('chat.folderShare.alreadyHave')
        : t('chat.folderShare.preview', { count: view.chats.length })
    ),
    el(ChatChecks, {
      key: 'c',
      items: addlistItems(view, t),
      picked: chosen,
      field: 'addlist-chat',
      toggle: (chat) => setPicked(toggled(chosen, chat)),
    }),
  ];
};

const AddlistDialog = ({ api, slug, close }) => {
  const t = useT();
  const state = useAddlist(api, slug);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const view = state.view;
  const choosable = (view?.chats ?? []).filter((c) => !c.joined);
  const chosen = picked ?? new Set(choosable.map((c) => c.chat));
  const join = async () => {
    await folderWrite(
      () => api.telegramChatlistJoin({ slug, chats: [...chosen] }),
      {
        t,
        setBusy,
        setError,
        close,
      }
    );
  };
  const canJoin = Boolean(view) && chosen.size > 0;
  return onBody(
    el(
      FormDialog,
      {
        name: 'addlist',
        title: t('chat.folderShare.addlistTitle'),
        onClose: close,
        onSubmit: canJoin ? join : () => {},
        submit: view?.already
          ? t('chat.folderShare.joinChats')
          : t('chat.folderShare.addFolder'),
        busy: busy || !canJoin,
        error,
      },
      el(AddlistBody, { t, state, chosen, setPicked })
    )
  );
};

/** Mounted once: opens the shared folder's preview when a link asks. */
export const AddlistHost = ({ api }) => {
  const [slug, setSlug] = useState(null);
  useEffect(() => {
    const on = (event) => setSlug(event.detail?.slug ?? null);
    globalThis.addEventListener?.(EVENT, on);
    return () => globalThis.removeEventListener?.(EVENT, on);
  }, []);
  return slug && typeof api?.telegramChatlistCheck === 'function'
    ? el(AddlistDialog, { key: slug, api, slug, close: () => setSlug(null) })
    : null;
};

// ---- Leave folder -------------------------------------------------------

/** "Leave folder": which of its chats to leave as well. */
export const LeaveFolder = ({ api, folder, chats = [], close }) => {
  const t = useT();
  const [suggested, setSuggested] = useState(null);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    api.telegramChatlistLeaveSuggestions({ id: folder.id }).then(
      (a) => live && setSuggested(a?.ok ? (a.chats ?? []) : []),
      () => live && setSuggested([])
    );
    return () => {
      live = false;
    };
  }, [api, folder.id]);
  const items = eligibleChats(folder, chats).map((c) => ({
    ...c,
    note: suggested?.includes(c.chat) ? t('chat.folderShare.suggested') : '',
  }));
  const chosen = picked ?? new Set(suggested ?? []);
  const leave = async () => {
    await folderWrite(
      () => api.telegramChatlistLeave({ id: folder.id, chats: [...chosen] }),
      {
        t,
        setBusy,
        setError,
        close,
      }
    );
  };
  return onBody(
    el(
      FormDialog,
      {
        name: 'folder-leave',
        title: t('chat.folderShare.leaveTitle'),
        onClose: close,
        onSubmit: leave,
        submit: t('chat.folderShare.leave'),
        busy: busy || suggested === null,
        error,
      },
      [
        el(
          'p',
          { key: 'p' },
          t('chat.folderShare.leaveAsk', { name: folder.title })
        ),
        items.length > 0
          ? el(ChatChecks, {
              key: 'c',
              items,
              picked: chosen,
              field: 'leave-chat',
              toggle: (chat) => setPicked(toggled(chosen, chat)),
            })
          : null,
      ]
    )
  );
};
