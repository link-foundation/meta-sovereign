// Quick replies, as Telegram Desktop's Settings → Telegram Business →
// Quick Replies has them (R-Y179; learned, never copied): the shortcuts in
// Telegram's order (move one up or down), "New shortcut" with its name and
// first message, and a shortcut opened to see its messages — add, edit and
// delete them, rename the shortcut or delete it. Every change is one click
// on its own button; Telegram's refusals (Premium needed, name taken, too
// many shortcuts) show in words.

import React, { useCallback, useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import {
  errorText,
  forgetQuickReplies,
  nameProblem,
} from './quick-replies-model.js';

const el = React.createElement;

const Problem = ({ t, code }) =>
  code
    ? el(
        'p',
        {
          className: 'comments-failed',
          role: 'alert',
          'data-quick-error': code,
        },
        errorText(t, code)
      )
    : null;

// One write: busy while Telegram answers, then `done`, or the error code.
const useWrite = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const write = async (ask, done) => {
    setBusy(true);
    setError(null);
    const answer = await Promise.resolve()
      .then(ask)
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      forgetQuickReplies();
      await done?.(answer);
    } else {
      setError(answer?.code ?? 'failed');
    }
    return Boolean(answer?.ok);
  };
  return { busy, error, setError, write };
};

const Button = ({ name, onClick, disabled, children, ...rest }) =>
  el(
    'button',
    {
      type: 'button',
      'data-action': name,
      disabled,
      onClick,
      ...rest,
    },
    children
  );

// The shortcuts, asked now and again after a change.
const useShortcuts = (api) => {
  const [state, setState] = useState({ phase: 'loading', replies: [] });
  const load = useCallback(async () => {
    const answer = await api.telegramQuickReplies().catch(() => null);
    setState(
      answer?.ok
        ? { phase: 'ready', replies: answer.replies ?? [] }
        : { phase: 'error', code: answer?.code ?? 'failed', replies: [] }
    );
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);
  return [state, load];
};

const preview = (t, message) =>
  message.text || (message.media ? t(`quick.media.${message.media}`) : '');

const ShortcutRow = ({ t, reply, first, last, onOpen, onMoved }) => {
  const { busy, error, write } = useWrite();
  return el('li', { className: 'quick-row', 'data-shortcut': reply.name }, [
    el(
      'button',
      {
        key: 'o',
        type: 'button',
        className: 'quick-open',
        'data-action': 'quick-open',
        onClick: () => onOpen(reply),
      },
      [
        el('b', { key: 'n' }, `/${reply.name}`),
        el(
          'span',
          { key: 'p', className: 'meta quick-preview' },
          reply.preview
        ),
        el(
          'span',
          { key: 'c', className: 'meta' },
          t('quick.count', { count: reply.count })
        ),
      ]
    ),
    el(
      Button,
      {
        key: 'u',
        name: 'quick-up',
        disabled: busy || first,
        'aria-label': t('quick.up'),
        title: t('quick.up'),
        onClick: () => write(() => onMoved(reply, -1)),
      },
      '↑'
    ),
    el(
      Button,
      {
        key: 'd',
        name: 'quick-down',
        disabled: busy || last,
        'aria-label': t('quick.down'),
        title: t('quick.down'),
        onClick: () => write(() => onMoved(reply, 1)),
      },
      '↓'
    ),
    error ? el(Problem, { key: 'e', t, code: error }) : null,
  ]);
};

const List = ({ api, t, state, reload, onOpen, onNew }) => {
  const { replies } = state;
  const move = async (reply, step) => {
    const order = replies.map((r) => r.id);
    const from = order.indexOf(reply.id);
    order.splice(from, 1);
    order.splice(from + step, 0, reply.id);
    const answer = await api.telegramQuickReplyReorder({ order });
    await reload();
    return answer;
  };
  if (state.phase === 'loading') {
    return el('p', { className: 'meta' }, t('quick.loading'));
  }
  return el('div', { className: 'quick-list' }, [
    el(Problem, { key: 'e', t, code: state.code }),
    replies.length === 0 && state.phase === 'ready'
      ? el('p', { key: 'n', className: 'meta' }, t('quick.none'))
      : el(
          'ul',
          { key: 'l', className: 'member-list quick-shortcuts' },
          replies.map((reply, i) =>
            el(ShortcutRow, {
              key: reply.id,
              t,
              reply,
              first: i === 0,
              last: i === replies.length - 1,
              onOpen,
              onMoved: move,
            })
          )
        ),
    el('p', { key: 'h', className: 'meta' }, t('quick.hint')),
    el(Button, { key: 'b', name: 'quick-new', onClick: onNew }, t('quick.new')),
  ]);
};

const NewShortcut = ({ api, t, suggest, done }) => {
  const [name, setName] = useState(suggest ?? '');
  const [text, setText] = useState('');
  const { busy, error, setError, write } = useWrite();
  const create = () => {
    const problem = nameProblem(name);
    if (problem) {
      setError(problem);
    } else {
      write(
        () => api.telegramQuickReplyCreate({ name: name.trim(), text }),
        done
      );
    }
  };
  return el('div', { className: 'quick-form' }, [
    el('label', { key: 'n', className: 'chat-form-field' }, [
      el('span', { key: 'l', className: 'meta' }, t('quick.name')),
      el('input', {
        key: 'i',
        type: 'text',
        'data-field': 'shortcut-name',
        maxLength: 32,
        autoFocus: true,
        value: name,
        onChange: (e) => setName(e.target.value),
      }),
    ]),
    el('label', { key: 't', className: 'chat-form-field' }, [
      el('span', { key: 'l', className: 'meta' }, t('quick.firstMessage')),
      el('textarea', {
        key: 'i',
        rows: 3,
        'data-field': 'message-text',
        value: text,
        onChange: (e) => setText(e.target.value),
      }),
    ]),
    el(Problem, { key: 'e', t, code: error }),
    el(
      Button,
      { key: 'c', name: 'quick-create', disabled: busy, onClick: create },
      t('quick.create')
    ),
  ]);
};

const MessageRow = ({ api, t, shortcut, message, reload }) => {
  const [editing, setEditing] = useState(null);
  const { busy, error, write } = useWrite();
  const save = () =>
    write(
      () =>
        api.telegramQuickReplyEdit({
          shortcutId: shortcut.id,
          id: message.id,
          text: editing,
        }),
      async () => {
        setEditing(null);
        await reload();
      }
    );
  return el('li', { className: 'quick-message', 'data-message': message.id }, [
    editing === null
      ? el('span', { key: 't', className: 'quick-text' }, preview(t, message))
      : el('textarea', {
          key: 't',
          rows: 3,
          'data-field': 'edit-text',
          value: editing,
          onChange: (e) => setEditing(e.target.value),
        }),
    editing === null
      ? el(
          Button,
          {
            key: 'e',
            name: 'message-edit',
            disabled: Boolean(message.media) && message.text === '',
            onClick: () => setEditing(message.text),
          },
          t('quick.edit')
        )
      : el(
          Button,
          { key: 's', name: 'message-save', disabled: busy, onClick: save },
          t('quick.save')
        ),
    el(
      Button,
      {
        key: 'd',
        name: 'message-delete',
        disabled: busy,
        onClick: () =>
          write(
            () =>
              api.telegramQuickReplyDeleteMessages({
                shortcutId: shortcut.id,
                ids: [message.id],
              }),
            reload
          ),
      },
      t('quick.delete')
    ),
    el(Problem, { key: 'x', t, code: error }),
  ]);
};

const Rename = ({ api, t, shortcut, renamed }) => {
  const [name, setName] = useState(shortcut.name);
  const { busy, error, setError, write } = useWrite();
  const save = () => {
    const problem = nameProblem(name);
    if (problem) {
      setError(problem);
    } else if (name.trim() !== shortcut.name) {
      write(
        () =>
          api.telegramQuickReplyRename({
            shortcutId: shortcut.id,
            name: name.trim(),
          }),
        () => renamed(name.trim())
      );
    }
  };
  return el('div', { className: 'quick-rename' }, [
    el('input', {
      key: 'i',
      type: 'text',
      'data-field': 'rename',
      'aria-label': t('quick.name'),
      maxLength: 32,
      value: name,
      onChange: (e) => setName(e.target.value),
    }),
    el(
      Button,
      { key: 'b', name: 'quick-rename', disabled: busy, onClick: save },
      t('quick.rename')
    ),
    el(Problem, { key: 'e', t, code: error }),
  ]);
};

const AddMessage = ({ api, t, shortcut, reload }) => {
  const [text, setText] = useState('');
  const { busy, error, write } = useWrite();
  return el('div', { className: 'quick-add' }, [
    el('textarea', {
      key: 't',
      rows: 2,
      'data-field': 'new-message',
      'aria-label': t('quick.addMessage'),
      placeholder: t('quick.addMessage'),
      value: text,
      onChange: (e) => setText(e.target.value),
    }),
    el(
      Button,
      {
        key: 'b',
        name: 'message-add',
        disabled: busy || text.trim() === '',
        onClick: () =>
          write(
            () => api.telegramQuickReplyAdd({ shortcutId: shortcut.id, text }),
            async () => {
              setText('');
              await reload();
            }
          ),
      },
      t('quick.add')
    ),
    el(Problem, { key: 'e', t, code: error }),
  ]);
};

const DeleteShortcut = ({ api, t, shortcut, gone }) => {
  const [sure, setSure] = useState(false);
  const { busy, error, write } = useWrite();
  return el('div', { className: 'quick-delete' }, [
    sure
      ? el('span', { key: 'q', className: 'meta' }, t('quick.deleteAsk'))
      : null,
    sure
      ? el(
          Button,
          {
            key: 'y',
            name: 'quick-delete-yes',
            disabled: busy,
            onClick: () =>
              write(
                () => api.telegramQuickReplyDelete({ shortcutId: shortcut.id }),
                gone
              ),
          },
          t('quick.deleteYes')
        )
      : el(
          Button,
          { key: 'd', name: 'quick-delete', onClick: () => setSure(true) },
          t('quick.deleteShortcut')
        ),
    sure
      ? el(
          Button,
          { key: 'n', name: 'quick-delete-no', onClick: () => setSure(false) },
          t('quick.cancel')
        )
      : null,
    el(Problem, { key: 'e', t, code: error }),
  ]);
};

const Shortcut = ({ api, t, initial, back }) => {
  const [shortcut, setShortcut] = useState(initial);
  const [state, setState] = useState({ phase: 'loading', messages: [] });
  const reload = useCallback(async () => {
    const answer = await api
      .telegramQuickReplyMessages({ shortcutId: shortcut.id })
      .catch(() => null);
    setState(
      answer?.ok
        ? { phase: 'ready', messages: answer.messages ?? [] }
        : { phase: 'error', code: answer?.code ?? 'failed', messages: [] }
    );
  }, [api, shortcut.id]);
  useEffect(() => {
    reload();
  }, [reload]);
  return el('div', { className: 'quick-shortcut' }, [
    el(
      Button,
      { key: 'bk', name: 'quick-back', onClick: back },
      t('quick.back')
    ),
    el(Rename, {
      key: 'r',
      api,
      t,
      shortcut,
      renamed: (name) => setShortcut({ ...shortcut, name }),
    }),
    state.phase === 'loading'
      ? el('p', { key: 'l', className: 'meta' }, t('quick.loading'))
      : el(
          'ul',
          { key: 'm', className: 'member-list quick-messages' },
          state.messages.map((message) =>
            el(MessageRow, {
              key: message.id,
              api,
              t,
              shortcut,
              message,
              reload,
            })
          )
        ),
    el(Problem, {
      key: 'e',
      t,
      code: state.phase === 'error' ? state.code : null,
    }),
    el(AddMessage, { key: 'a', api, t, shortcut, reload }),
    el(DeleteShortcut, { key: 'd', api, t, shortcut, gone: back }),
  ]);
};

/**
 * The Quick Replies editor in a dialog. `suggest` is a name to start a new
 * shortcut with ("hello", "away"); `onClose` runs when it closes.
 */
export const QuickRepliesDialog = ({ api, close, suggest = null }) => {
  const t = useT();
  const [state, reload] = useShortcuts(api);
  const [view, setView] = useState(
    suggest ? { kind: 'new' } : { kind: 'list' }
  );
  const list = () => {
    setView({ kind: 'list' });
    return reload();
  };
  let body;
  if (view.kind === 'new') {
    body = el(NewShortcut, { api, t, suggest, done: list });
  } else if (view.kind === 'open') {
    body = el(Shortcut, { api, t, initial: view.reply, back: list });
  } else {
    body = el(List, {
      api,
      t,
      state,
      reload,
      onOpen: (reply) => setView({ kind: 'open', reply }),
      onNew: () => setView({ kind: 'new' }),
    });
  }
  return el(
    Frame,
    { title: t('quick.title'), close, name: 'quick-replies' },
    body
  );
};
