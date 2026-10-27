/**
 * An automation in the chat (R-Y86, R-Y87): its draft for this chat, the
 * next chat it fits once this one is done (with the user's edited text),
 * and the autopilot's line — where it is, the monitor, and Stop.
 */

import React, { useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { presetName } from './automations-model.js';
import { Icon } from './icons.js';
import { Spinner } from './spinner.js';
import { failureText } from './chat-failure.js';
import { isTelegramWebUrl } from '../sources/telegram-chat-url.js';

const el = React.createElement;

const FORM_KEYS = {
  informal: 'chat.form.informal',
  formal: 'chat.form.formal',
};

// "Open chat": the network's own app, the text filled in where it can.
const OpenElsewhere = ({ prefill, t }) =>
  prefill
    ? el(
        'a',
        {
          className: 'button',
          href: prefill.url,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        t(
          isTelegramWebUrl(prefill.url)
            ? 'chat.about.openTelegramWeb'
            : prefill.prefillsText
              ? 'chat.draft.openFilled'
              : 'chat.draft.open'
        )
      )
    : null;

// One action at a time; the pressed button turns while it works.
const useWorking = () => {
  const [working, setWorking] = useState(null);
  const run = async (name, task) => {
    setWorking(name);
    try {
      await task();
    } finally {
      setWorking(null);
    }
  };
  return [working, run];
};

export const DraftCard = ({ draft, drafts, autopilot }) => {
  const t = useT();
  const other = draft.form === 'formal' ? 'informal' : 'formal';
  const [working, run] = useWorking();
  const button = (action, label, task) =>
    el(
      'button',
      {
        key: action,
        type: 'button',
        'data-action': `draft-${action}`,
        disabled: working !== null,
        'aria-busy': working === action ? 'true' : undefined,
        onClick: () => run(action, task),
        className: action === 'send' ? 'primary' : undefined,
      },
      label
    );
  const act =
    (action, extra = {}) =>
    () =>
      drafts.act(action, { ...draft, ...extra });
  const piloting =
    autopilot?.shown?.on && autopilot.shown.automation === draft.automation;
  return el(
    'div',
    {
      className: 'draft-card',
      'data-draft': draft.id,
      'data-form': draft.form,
    },
    [
      el('p', { key: 'h', className: 'meta' }, [
        t('chat.draft.title', {
          name: presetName(t, draft.automationName ?? draft.automation),
          form: t(FORM_KEYS[draft.form] ?? FORM_KEYS.informal),
        }),
        draft.edited ? ` · ${t('chat.draft.edited')}` : null,
      ]),
      el('textarea', {
        key: 'text',
        rows: 4,
        value: draft.text,
        'aria-label': t('chat.draft.text'),
        onChange: (event) => drafts.edit(draft.id, event.target.value),
      }),
      el('div', { key: 'actions', className: 'row' }, [
        button('send', t('chat.draft.send'), act('send')),
        button(
          'form',
          t('chat.draft.switchTo', { form: t(FORM_KEYS[other]) }),
          act('form', { form: other })
        ),
        draft.edited
          ? button('reset', t('chat.draft.useOwn'), () => drafts.reset(draft))
          : null,
        el(OpenElsewhere, { key: 'open', prefill: draft.prefill, t }),
        button('mark', t('chat.draft.markSent'), act('mark')),
        button('skip', t('chat.draft.skip'), act('skip')),
        autopilot && !piloting
          ? button('autopilot', t('chat.draft.autopilot'), () =>
              autopilot.start(draft.automation)
            )
          : null,
      ]),
    ]
  );
};

const NEXT_ICON_SIZE = 16;

/** After a draft is settled: the next chat it fits, one press away. */
export const NextChatBar = ({ drafts, autopilot }) => {
  const t = useT();
  const next = drafts?.next;
  if (!next?.draft) {
    return null;
  }
  return el('div', { className: 'chat-notice next-chat', role: 'status' }, [
    el(
      'span',
      { key: 't' },
      t(next.draft.edited ? 'chat.next.edited' : 'chat.next.text', {
        name: next.draft.name ?? next.draft.chat,
      })
    ),
    el('span', { key: 'a', className: 'row' }, [
      el(
        'button',
        {
          key: 'open',
          type: 'button',
          className: 'primary',
          'data-action': 'next-open',
          onClick: drafts.openNext,
        },
        t('chat.next.open')
      ),
      autopilot
        ? el(
            'button',
            {
              key: 'auto',
              type: 'button',
              'data-action': 'next-autopilot',
              onClick: () => autopilot.start(next.automation),
            },
            t('chat.draft.autopilot')
          )
        : null,
      el(
        'button',
        {
          key: 'x',
          type: 'button',
          className: 'icon-btn',
          'aria-label': t('chat.notice.dismiss'),
          title: t('chat.notice.dismiss'),
          onClick: drafts.dismissNext,
        },
        el(Icon, { name: 'close', size: NEXT_ICON_SIZE })
      ),
    ]),
  ]);
};

const SECOND_MS = 1000;

// Seconds until `at`, counting down while shown.
export const useSecondsTo = (at) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) {
      return undefined;
    }
    const timer = globalThis.setInterval(() => setNow(Date.now()), SECOND_MS);
    return () => globalThis.clearInterval(timer);
  }, [at]);
  return at ? Math.max(0, Math.ceil((Date.parse(at) - now) / SECOND_MS)) : null;
};

/** What the autopilot is doing, in words. */
export const autopilotText = (t, state, seconds, time = (v) => v) => {
  const name = state.current?.name ?? state.current?.chat ?? '';
  switch (state.status) {
    case 'sending':
      return t('chat.autopilot.sending', { name });
    case 'waiting':
      return t('chat.autopilot.waiting', { seconds: seconds ?? 0 });
    case 'capped':
      return t('chat.autopilot.capped', { time: time(state.nextAt) });
    case 'quiet':
      return t('chat.autopilot.quiet', { time: time(state.nextAt) });
    case 'done':
      return t('chat.autopilot.done');
    case 'paused':
      return t('chat.autopilot.paused', {
        reason: failureText(t, { code: state.error, error: state.error }),
      });
    default:
      return t('chat.autopilot.starting');
  }
};

/** The autopilot's line: where it is, the monitor, and Stop. */
export const AutopilotBar = ({ autopilot }) => {
  const t = useT();
  const { dateTime } = useDates();
  const state = autopilot?.shown;
  const seconds = useSecondsTo(
    state?.status === 'waiting' ? state.nextAt : null
  );
  if (!state) {
    return null;
  }
  const text = autopilotText(t, state, seconds, (at) =>
    at ? dateTime(at) : ''
  );
  const counts = t('chat.autopilot.counts', {
    sent: state.sent ?? 0,
    failed: state.failed ?? 0,
  });
  return el(
    'div',
    {
      className: `chat-notice autopilot-bar ${state.on ? 'on' : 'off'}`,
      'data-autopilot': state.status,
      role: 'status',
    },
    [
      el('span', { key: 't', className: 'autopilot-text' }, [
        state.on && ['starting', 'sending'].includes(state.status)
          ? el(Spinner, { key: 's' })
          : null,
        el(
          'strong',
          { key: 'n' },
          t('chat.autopilot.title', {
            name: presetName(t, state.automationName ?? state.automation),
          })
        ),
        ` ${text} · ${counts}`,
      ]),
      el('span', { key: 'a', className: 'row' }, [
        state.on
          ? el('label', { key: 'm', className: 'autopilot-monitor' }, [
              el('input', {
                key: 'c',
                type: 'checkbox',
                checked: Boolean(state.monitor),
                onChange: (event) =>
                  autopilot.monitor(state.automation, event.target.checked),
              }),
              ` ${t('chat.autopilot.monitor')}`,
            ])
          : null,
        el(
          'button',
          {
            key: 'b',
            type: 'button',
            'data-action': state.on ? 'autopilot-stop' : 'autopilot-close',
            onClick: () =>
              state.on ? autopilot.stop(state.automation) : autopilot.dismiss(),
          },
          t(state.on ? 'chat.autopilot.stop' : 'chat.notice.dismiss')
        ),
      ]),
    ]
  );
};
