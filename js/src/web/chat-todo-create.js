// Creating a checklist from the paperclip menu, as Telegram Desktop does
// (R-Y195; learned, never copied): a title (32 characters), tasks (30 at
// most, 64 characters each; filling the last one adds the next, each can
// be taken away) and the switches "Others can add tasks" and "Others can
// mark as done". Create sends it through the same path as a poll — the
// reply, Send as and the paid-message confirmation all apply — and the
// checklist then shows in the chat as any message.

import React, { useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { Check, useMediaCreate } from './chat-poll-create.js';
import { useEsc } from './chat-invite.js';
import { TODO_LIMITS } from './poll-parts.js';

const el = React.createElement;

/** The paperclip menu's "Checklist": the dialog's state and sending. */
export const useTodoCreate = (args) =>
  useMediaCreate({ ...args, call: 'telegramSendTodo' });

let counter = 0;
const blank = () => {
  counter += 1;
  return { id: counter, text: '' };
};

// One empty task kept at the end while there is room for another.
const padded = (tasks) => {
  const last = tasks[tasks.length - 1];
  return tasks.length < TODO_LIMITS.items && (!last || last.text.trim() !== '')
    ? [...tasks, blank()]
    : tasks;
};

const initial = () => ({
  title: '',
  tasks: [blank()],
  othersCanAppend: true,
  othersCanComplete: true,
});

/** The body for POST /api/telegram/send-todo, or null while not ready. */
export const todoBody = (form) => {
  const title = form.title.trim();
  const items = form.tasks.map((x) => x.text.trim()).filter(Boolean);
  if (!title || items.length === 0 || items.length > TODO_LIMITS.items) {
    return null;
  }
  return {
    title,
    items,
    othersCanAppend: form.othersCanAppend,
    othersCanComplete: form.othersCanComplete,
  };
};

/** A form after one edit: a task typed or taken away, or plain values. */
export const changedTodo = (form, change) => {
  const { type, drop, ...plain } = change;
  let tasks = form.tasks;
  if (type) {
    tasks = tasks.map((x) => (x.id === type[0] ? { ...x, text: type[1] } : x));
  }
  if (drop !== undefined) {
    tasks = tasks.filter((x) => x.id !== drop);
  }
  return { ...form, ...plain, tasks: padded(tasks) };
};

const TaskRow = ({ task, last, set, t }) =>
  el('li', { className: 'poll-option' }, [
    el('input', {
      key: 'i',
      type: 'text',
      value: task.text,
      maxLength: TODO_LIMITS.item,
      placeholder: t('chat.todoNew.task'),
      'aria-label': t('chat.todoNew.task'),
      'data-field': 'task',
      onChange: (e) => set({ type: [task.id, e.target.value] }),
    }),
    last
      ? null
      : el(
          'button',
          {
            key: 'x',
            type: 'button',
            className: 'icon-btn poll-remove',
            'data-action': 'todo-remove',
            'aria-label': t('chat.todoNew.remove'),
            title: t('chat.todoNew.remove'),
            onClick: () => set({ drop: task.id }),
          },
          el(Icon, { name: 'close', size: 16 })
        ),
  ]);

/** "New checklist": the title, the tasks, the switches, Create. */
export const TodoDialog = ({ todo }) => {
  const t = useT();
  const [form, setForm] = useState(initial);
  const set = (change) => setForm((now) => changedTodo(now, change));
  useEsc(todo.close);
  const body = todoBody(form);
  const create = () => body && !todo.sending && todo.send(body);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.todoNew.title'),
    },
    el('div', { className: 'delete-dialog poll-dialog' }, [
      el('h3', { key: 'h' }, t('chat.todoNew.title')),
      el('input', {
        key: 'q',
        type: 'text',
        autoFocus: true,
        className: 'poll-question',
        value: form.title,
        maxLength: TODO_LIMITS.title,
        placeholder: t('chat.todoNew.name'),
        'aria-label': t('chat.todoNew.name'),
        'data-field': 'title',
        onChange: (e) => set({ title: e.target.value }),
      }),
      el(
        'h4',
        { key: 'oh', className: 'poll-heading' },
        t('chat.todoNew.tasks')
      ),
      el(
        'ul',
        { key: 'o', className: 'poll-options' },
        form.tasks.map((task, i) =>
          el(TaskRow, {
            key: task.id,
            task,
            last: task.text === '' && i === form.tasks.length - 1,
            set,
            t,
          })
        )
      ),
      el(Check, {
        key: 'append',
        name: 'others-append',
        checked: form.othersCanAppend,
        onChange: (othersCanAppend) => set({ othersCanAppend }),
        label: t('chat.todoNew.othersAppend'),
      }),
      el(Check, {
        key: 'complete',
        name: 'others-complete',
        checked: form.othersCanComplete,
        onChange: (othersCanComplete) => set({ othersCanComplete }),
        label: t('chat.todoNew.othersComplete'),
      }),
      el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'ok',
            type: 'button',
            className: 'primary',
            disabled: !body || todo.sending,
            'data-action': 'todo-create',
            onClick: create,
          },
          t('chat.todoNew.create')
        ),
        el(
          'button',
          { key: 'cancel', type: 'button', onClick: todo.close },
          t('common.cancel')
        ),
      ]),
    ])
  );
};
