// Chatbots of Telegram Business, as Telegram Desktop has them (R-Y180;
// learned, never copied): in Settings the connected bot, connected by its
// username, with the chats it serves and whether it may reply, and
// "Disconnect" (asked first); over a chat the bot manages, a bar that
// says so, with Pause / Resume for this chat and "Remove bot from this
// chat" (asked first). Nothing is sent until Save or a button is pressed.

import React, { useEffect, useState } from 'react';
import { useLocaleContext } from './i18n.js';
import { Field, FormDialog } from './chat-create.js';
import {
  errorText,
  useBusinessRead,
  useSaving,
} from './chat-business-common.js';

const el = React.createElement;

export const KINDS = ['existingChats', 'newChats', 'contacts', 'nonContacts'];

/** A typed bot name as its username, or null. */
export const botUsername = (value) => {
  const name = String(value ?? '')
    .trim()
    .replace(/^@/, '');
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(name) ? name : null;
};

/** The form for the bot connected (null: none) as `{ username, ... }`. */
export const botForm = (bot) => ({
  username: bot?.username ?? '',
  canReply: bot ? bot.canReply : true,
  recipients: Object.fromEntries(
    KINDS.map((k) => [k, bot ? Boolean(bot.recipients[k]) : true])
  ),
});

/** The code that stops a Save, or null. */
export const botProblem = (form) => {
  if (!botUsername(form.username)) {
    return 'no-bot';
  }
  return KINDS.some((k) => form.recipients[k]) ? null : 'recipients-empty';
};

const keptPeople = (bot) =>
  (bot?.recipients.users.length ?? 0) +
  (bot?.recipients.excludeUsers.length ?? 0);

const Disconnect = ({ api, t, done }) => {
  const [asking, setAsking] = useState(false);
  const saving = useSaving(t, done);
  return el('div', { className: 'business-disconnect' }, [
    asking
      ? el('span', { key: 'q' }, t('chat.business.bots.disconnectAsk'))
      : null,
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: asking ? 'danger' : '',
        'data-action': asking ? 'bot-disconnect-confirm' : 'bot-disconnect',
        disabled: saving.busy,
        onClick: () =>
          asking
            ? saving.save(() => api.telegramBusinessBotRemove())
            : setAsking(true),
      },
      t('chat.business.bots.disconnect')
    ),
    saving.error
      ? el(
          'p',
          { key: 'e', role: 'alert', className: 'chat-form-error' },
          saving.error
        )
      : null,
  ]);
};

const BotForm = ({ api, t, close, bot }) => {
  const [form, setForm] = useState(() => botForm(bot));
  const saving = useSaving(t, close);
  const kept = keptPeople(bot);
  const submit = () => {
    const problem = botProblem(form);
    if (problem) {
      saving.fail(problem);
      return;
    }
    saving.save(() =>
      api.telegramBusinessBotSet({
        username: botUsername(form.username),
        recipients: form.recipients,
        canReply: form.canReply,
      })
    );
  };
  return el(
    FormDialog,
    {
      name: 'business-bot',
      title: t('chat.business.bots'),
      onClose: close,
      onSubmit: submit,
      submit: t('chat.business.save'),
      busy: saving.busy,
      error: saving.error,
      outside: true,
    },
    [
      el('p', { key: 'h', className: 'meta' }, t('chat.business.bots.hint')),
      bot
        ? el(
            'p',
            {
              key: 'now',
              className: 'business-bot-now',
              'data-field': 'bot-now',
            },
            t('chat.business.bots.connected', { name: bot.name })
          )
        : null,
      el(Field, {
        key: 'u',
        label: t('chat.business.bots.username'),
        name: 'bot-username',
        value: form.username,
        maxLength: 33,
        autoFocus: true,
        placeholder: '@username',
        onChange: (e) => setForm({ ...form, username: e.target.value }),
      }),
      el('strong', { key: 'rh' }, t('chat.business.bots.recipients')),
      ...KINDS.map((kind) =>
        el('label', { key: kind, className: 'business-switch' }, [
          el('input', {
            key: 'c',
            type: 'checkbox',
            checked: form.recipients[kind],
            'data-field': `recipient-${kind}`,
            onChange: () =>
              setForm({
                ...form,
                recipients: {
                  ...form.recipients,
                  [kind]: !form.recipients[kind],
                },
              }),
          }),
          ` ${t(`chat.business.bots.to.${kind}`)}`,
        ])
      ),
      kept > 0
        ? el(
            'p',
            { key: 'kept', className: 'meta' },
            t('chat.business.bots.kept', { count: kept })
          )
        : null,
      el('label', { key: 'r', className: 'business-switch' }, [
        el('input', {
          key: 'c',
          type: 'checkbox',
          checked: form.canReply,
          'data-field': 'bot-can-reply',
          onChange: () => setForm({ ...form, canReply: !form.canReply }),
        }),
        ` ${t('chat.business.bots.canReply')}`,
      ]),
      bot ? el(Disconnect, { key: 'x', api, t, done: close }) : null,
    ]
  );
};

/** Settings → Business → Chatbots. */
export const BotDialog = ({ api, close }) => {
  const { t } = useLocaleContext();
  const read = useBusinessRead(() => api.telegramBusinessBot());
  if (read.phase === 'ready') {
    return el(BotForm, { api, t, close, bot: read.data.bot });
  }
  return el(
    FormDialog,
    {
      name: 'business-bot',
      title: t('chat.business.bots'),
      onClose: close,
      onSubmit: close,
      submit: t('chat.create.cancel'),
      busy: false,
      error: read.phase === 'error' ? errorText(t, read.code) : null,
      outside: true,
    },
    read.phase === 'loading'
      ? el('p', { className: 'meta' }, t('chat.business.loading'))
      : null
  );
};

// What manages this chat, asked once when it opens.
const useBotBar = (api, chat) => {
  const [bar, setBar] = useState(null);
  const wanted =
    chat?.source === 'telegram' &&
    /^\d+$/.test(String(chat.chat)) &&
    typeof api?.telegramBusinessBotChat === 'function';
  useEffect(() => {
    setBar(null);
    if (!wanted) {
      return undefined;
    }
    let live = true;
    api
      .telegramBusinessBotChat({ chat: String(chat.chat) })
      .then((answer) => live && answer?.ok && setBar(answer.bar))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [wanted, chat?.chat]);
  return [bar, setBar];
};

/**
 * The bar over a chat a connected bot manages: who it is, Pause / Resume
 * for this chat and "Remove bot from this chat" (asked first).
 */
export const BotBar = ({ api, chat }) => {
  const { t } = useLocaleContext();
  const [bar, setBar] = useBotBar(api, chat);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);
  if (!bar) {
    return null;
  }
  const key = String(chat.chat);
  const run = async (call, then) => {
    const answer = await call().catch(() => null);
    if (answer?.ok) {
      setError(null);
      then(answer);
    } else {
      setError(errorText(t, answer?.code ?? 'failed'));
    }
  };
  return el(
    'div',
    { className: 'peer-bar business-bot-bar', 'data-business-bot': key },
    [
      el(
        'span',
        { key: 'i', className: 'peer-bar-info' },
        t(
          bar.paused ? 'chat.business.bar.paused' : 'chat.business.bar.managed',
          {
            name: bar.name,
          }
        )
      ),
      el('div', { key: 'b', className: 'peer-bar-actions' }, [
        asking
          ? [
              el(
                'button',
                {
                  key: 'y',
                  type: 'button',
                  className: 'danger',
                  'data-action': 'bot-bar-remove-confirm',
                  onClick: () =>
                    run(
                      () => api.telegramBusinessBotDisable({ chat: key }),
                      () => setBar(null)
                    ),
                },
                t('chat.business.bar.remove')
              ),
              el(
                'button',
                {
                  key: 'n',
                  type: 'button',
                  'data-action': 'bot-bar-remove-cancel',
                  onClick: () => setAsking(false),
                },
                t('chat.create.cancel')
              ),
            ]
          : [
              el(
                'button',
                {
                  key: 'p',
                  type: 'button',
                  'data-action': bar.paused
                    ? 'bot-bar-resume'
                    : 'bot-bar-pause',
                  onClick: () =>
                    run(
                      () =>
                        api.telegramBusinessBotPause({
                          chat: key,
                          paused: !bar.paused,
                        }),
                      (answer) => setBar({ ...bar, paused: answer.paused })
                    ),
                },
                t(
                  bar.paused
                    ? 'chat.business.bar.resume'
                    : 'chat.business.bar.pause'
                )
              ),
              el(
                'button',
                {
                  key: 'r',
                  type: 'button',
                  'data-action': 'bot-bar-remove',
                  onClick: () => setAsking(true),
                },
                t('chat.business.bar.remove')
              ),
            ],
      ]),
      error
        ? el(
            'span',
            { key: 'e', role: 'alert', className: 'chat-form-error' },
            error
          )
        : null,
    ]
  );
};
