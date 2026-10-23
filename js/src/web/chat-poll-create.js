// Creating a poll, as Telegram Desktop does (R-Y121; learned, never copied): the
// paperclip's "Poll" opens "New poll" — a question (255 characters), 2
// to 10 options (100 each; filling the last empty one adds the next, each
// can be taken away), and the settings: anonymous voting (on), multiple
// answers, and a quiz — one option marked right, with an explanation of
// up to 200 characters; a quiz takes no multiple answers. Create asks the
// server to send it; the poll then shows in the chat as any message.
//
// Telegram user accounts only, as files are (./chat-attach.js).

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { composerReplyId } from './forum-topics.js';

const el = React.createElement;

export const LIMITS = {
  question: 255,
  option: 100,
  solution: 200,
  min: 2,
  max: 10,
};

export const canPoll = (state, api) =>
  state.current?.source === 'telegram' &&
  state.telegram?.kind === 'user' &&
  typeof api?.telegramSendPoll === 'function';

let counter = 0;
const blank = () => {
  counter += 1;
  return { id: counter, text: '' };
};

// Keep one empty field at the end while there is room for another.
const padded = (options) => {
  const last = options[options.length - 1];
  return options.length < LIMITS.max && (!last || last.text.trim() !== '')
    ? [...options, blank()]
    : options;
};

const filled = (options) => options.filter((o) => o.text.trim() !== '');

/** The body for POST /api/telegram/send-poll, or null while not ready. */
export const pollBody = (form) => {
  const question = form.question.trim();
  const options = filled(form.options);
  const right = options.findIndex((o) => o.id === form.correct);
  if (!question || options.length < LIMITS.min) {
    return null;
  }
  if (form.quiz && right < 0) {
    return null;
  }
  return {
    question,
    options: options.map((o) => o.text.trim()),
    anonymous: form.anonymous,
    multiple: form.quiz ? false : form.multiple,
    quiz: form.quiz,
    ...(form.quiz ? { correct: right } : {}),
    ...(form.quiz && form.solution.trim()
      ? { solution: form.solution.trim() }
      : {}),
  };
};

const newClientId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `poll-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** The dialog's state and what it does with the page's answer. */
export const usePollCreate = ({ state, api, composer }) => {
  const enabled = canPoll(state, api);
  const [shown, setShown] = useState(false);
  const [sending, setSending] = useState(false);
  const key = state.current?.key;
  useEffect(() => setShown(false), [key]);

  const send = async (body) => {
    if (sending || !enabled) {
      return;
    }
    setSending(true);
    const reply = composerReplyId(composer);
    const answer = await api
      .telegramSendPoll({
        chat: String(state.current.chat),
        ...body,
        ...(reply ? { replyTo: reply } : {}),
        clientId: newClientId(),
      })
      .catch((error) => ({ error: error.message }));
    setSending(false);
    if (answer?.ok) {
      composer?.clearReplyTo?.();
      setShown(false);
      return;
    }
    state.notify?.({
      kind: 'failed',
      code: answer?.code,
      error: answer?.error ?? 'not sent',
      retryAfter: answer?.retryAfter,
    });
  };
  return {
    enabled,
    shown: enabled && shown,
    sending,
    show: () => setShown(true),
    close: () => setShown(false),
    send,
  };
};

const useEsc = (onClose) => {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        latest.current?.();
      }
    };
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, []);
};

const Check = ({ name, checked, disabled, onChange, label }) =>
  el('label', { className: 'pin-dialog-option', 'data-option': name }, [
    el('input', {
      key: 'c',
      type: 'checkbox',
      checked,
      disabled,
      onChange: (e) => onChange(e.target.checked),
    }),
    el('span', { key: 'l' }, label),
  ]);

const OptionRow = ({ option, index, form, set, t }) => {
  const last = option.text === '' && index === form.options.length - 1;
  const mark = form.quiz
    ? el('input', {
        key: 'r',
        type: 'radio',
        name: 'poll-correct',
        className: 'poll-correct',
        checked: form.correct === option.id,
        disabled: option.text.trim() === '',
        'data-field': 'correct',
        'aria-label': t('chat.pollNew.correct'),
        title: t('chat.pollNew.correct'),
        onChange: () => set({ correct: option.id }),
      })
    : null;
  return el('li', { className: 'poll-option' }, [
    mark,
    el('input', {
      key: 'i',
      type: 'text',
      value: option.text,
      maxLength: LIMITS.option,
      placeholder: t('chat.pollNew.option'),
      'aria-label': t('chat.pollNew.option'),
      'data-field': 'option',
      onChange: (e) => set({ type: [option.id, e.target.value] }),
    }),
    last
      ? null
      : el(
          'button',
          {
            key: 'x',
            type: 'button',
            className: 'icon-btn poll-remove',
            'data-action': 'poll-remove',
            'aria-label': t('chat.pollNew.remove'),
            title: t('chat.pollNew.remove'),
            onClick: () => set({ drop: option.id }),
          },
          el(Icon, { name: 'close', size: 16 })
        ),
  ]);
};

const initial = () => ({
  question: '',
  options: [blank(), blank()],
  anonymous: true,
  multiple: false,
  quiz: false,
  correct: null,
  solution: '',
});

// A change to the form: the field typed in, an option taken away, or
// plain values; the options kept with one empty field at the end.
const changed = (form, change) => {
  const { type, drop, ...plain } = change;
  let options = form.options;
  if (type) {
    options = options.map((o) =>
      o.id === type[0] ? { ...o, text: type[1] } : o
    );
  }
  if (drop !== undefined) {
    options = options.filter((o) => o.id !== drop);
  }
  options = padded(options);
  while (options.length < LIMITS.min) {
    options = [...options, blank()];
  }
  const next = { ...form, ...plain, options };
  const right = options.find((o) => o.id === next.correct);
  return right && right.text.trim() ? next : { ...next, correct: null };
};

const Settings = ({ form, set, t }) => [
  el(Check, {
    key: 'anon',
    name: 'anonymous',
    checked: form.anonymous,
    onChange: (anonymous) => set({ anonymous }),
    label: t('chat.pollNew.anonymous'),
  }),
  el(Check, {
    key: 'multi',
    name: 'multiple',
    checked: form.multiple && !form.quiz,
    disabled: form.quiz,
    onChange: (multiple) => set({ multiple }),
    label: t('chat.pollNew.multiple'),
  }),
  el(Check, {
    key: 'quiz',
    name: 'quiz',
    checked: form.quiz,
    onChange: (quiz) =>
      set(quiz ? { quiz, multiple: false } : { quiz, correct: null }),
    label: t('chat.pollNew.quiz'),
  }),
  form.quiz
    ? el('textarea', {
        key: 'sol',
        rows: 2,
        className: 'poll-solution',
        value: form.solution,
        maxLength: LIMITS.solution,
        placeholder: t('chat.pollNew.solution'),
        'aria-label': t('chat.pollNew.solution'),
        'data-field': 'solution',
        onChange: (e) => set({ solution: e.target.value }),
      })
    : null,
];

/** "New poll": the question, the options, the settings, Create. */
export const PollDialog = ({ poll }) => {
  const t = useT();
  const [form, setForm] = useState(initial);
  const set = (change) => setForm((now) => changed(now, change));
  useEsc(poll.close);
  const body = pollBody(form);
  const create = () => body && !poll.sending && poll.send(body);
  const left = LIMITS.max - form.options.length;
  const needRight =
    form.quiz && !body && filled(form.options).length >= LIMITS.min;
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.pollNew.title'),
    },
    el('div', { className: 'delete-dialog poll-dialog' }, [
      el('h3', { key: 'h' }, t('chat.pollNew.title')),
      el('input', {
        key: 'q',
        type: 'text',
        autoFocus: true,
        className: 'poll-question',
        value: form.question,
        maxLength: LIMITS.question,
        placeholder: t('chat.pollNew.question'),
        'aria-label': t('chat.pollNew.question'),
        'data-field': 'question',
        onChange: (e) => set({ question: e.target.value }),
      }),
      el(
        'h4',
        { key: 'oh', className: 'poll-heading' },
        t('chat.pollNew.options')
      ),
      el(
        'ul',
        { key: 'o', className: 'poll-options' },
        form.options.map((option, index) =>
          el(OptionRow, { key: option.id, option, index, form, set, t })
        )
      ),
      el(
        'p',
        { key: 'more', className: 'schedule-hint', role: 'status' },
        left > 0
          ? t('chat.pollNew.more', { count: left })
          : t('chat.pollNew.full')
      ),
      ...Settings({ form, set, t }),
      needRight
        ? el(
            'p',
            { key: 'pick', className: 'schedule-hint', role: 'status' },
            t('chat.pollNew.pick')
          )
        : null,
      el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'ok',
            type: 'button',
            className: 'primary',
            disabled: !body || poll.sending,
            'data-action': 'poll-create',
            onClick: create,
          },
          t('chat.pollNew.create')
        ),
        el(
          'button',
          { key: 'cancel', type: 'button', onClick: poll.close },
          t('common.cancel')
        ),
      ]),
    ])
  );
};
