import React, { useEffect, useMemo, useState } from 'react';
import { useT, useDates } from './i18n.js';
import { Busy } from './spinner.js';
import { activeAccount } from './telegram-account-scope.js';
import { TelegramGreetingCatalog } from './telegram-greeting-catalog.js';
import { createGreetingSendModel } from './telegram-greeting-send-model.js';
import { TelegramGroupGreetings } from './telegram-group-greetings.js';

const el = React.createElement;
const button = (name, label, use, disabled = false) =>
  el(
    'button',
    {
      key: name,
      type: 'button',
      'data-greeting-send-action': name,
      onClick: use,
      disabled,
    },
    label
  );
const useGreetingSend = (api) => {
  const [, render] = useState(0);
  const model = useMemo(
    () => createGreetingSendModel(api, () => render((value) => value + 1)),
    [api]
  );
  useEffect(() => {
    model.start();
    return model.stop;
  }, [model]);
  return model;
};
const sendReason = (code, t) => {
  const known = [
    'bad-request',
    'busy',
    'stopped',
    'cancelled',
    'plan-expired',
    'account-changed',
    'target-changed',
    'bot-required',
    'target-unavailable',
    'sticker-unavailable',
    'user-account-required',
    'already-greeted',
    'previous-outcome-unknown',
  ];
  return t(
    `telegram.greeting.error.${known.includes(code) ? code : 'unavailable'}`
  );
};
const GreetingPreview = ({ plan, model, t }) => {
  const dates = useDates();
  if (!plan) {
    return null;
  }
  return el(
    'div',
    { className: 'card col', 'data-greeting-send-preview': '' },
    [
      el(
        'p',
        { key: 'target' },
        t('telegram.greeting.review', {
          owner: plan.owner,
          target: `${plan.target.name} (${plan.target.chat})`,
        })
      ),
      el(
        'p',
        { key: 'what' },
        plan.operation === 'bot-start'
          ? '/start'
          : t('telegram.greeting.chosen', {
              sticker: `${plan.sticker.emoji || '👋'} ${plan.sticker.id}`,
            })
      ),
      el(
        'p',
        { key: 'expiry', className: 'meta' },
        t('telegram.greeting.expires', { at: dates.dateTime(plan.expiresAt) })
      ),
      !plan.willSend
        ? el(
            'p',
            { key: 'reason', role: 'status' },
            sendReason(plan.delivery.code, t)
          )
        : null,
      button(
        'send',
        t('telegram.greeting.send'),
        model.apply,
        !plan.willSend || model.state.busy
      ),
    ]
  );
};
const GreetingForm = ({ model, t }) => {
  const { draft, busy } = model.state;
  return el(
    'fieldset',
    { className: 'telegram-greeting-send-form', disabled: busy },
    [
      el('legend', { key: 'legend' }, t('telegram.greeting.title')),
      el('label', { key: 'target', className: 'col' }, [
        t('telegram.greeting.target'),
        el('input', {
          key: 'input',
          type: 'text',
          value: draft.chat,
          'data-greeting-send-field': 'chat',
          onChange: (event) => model.update({ chat: event.target.value }),
          placeholder: '@username / -100123 / t.me/username',
          autoComplete: 'off',
        }),
      ]),
      el('label', { key: 'operation', className: 'col' }, [
        t('telegram.greeting.operation'),
        el(
          'select',
          {
            key: 'select',
            value: draft.operation,
            'data-greeting-send-field': 'operation',
            onChange: (event) =>
              model.update({ operation: event.target.value }),
          },
          ['greeting-sticker', 'bot-start'].map((name) =>
            el(
              'option',
              { key: name, value: name },
              t(`telegram.greeting.operation.${name}`)
            )
          )
        ),
      ]),
      draft.operation === 'greeting-sticker'
        ? el(
            'p',
            {
              key: 'selection',
              className: 'meta',
              'data-greeting-send-selection': '',
            },
            draft.sticker
              ? t('telegram.greeting.chosen', { sticker: draft.sticker })
              : t('telegram.greeting.random')
          )
        : null,
      draft.sticker && draft.operation === 'greeting-sticker'
        ? button('random', t('telegram.greeting.useRandom'), () =>
            model.update({ sticker: null })
          )
        : null,
      button(
        'preview',
        t('telegram.greeting.preview'),
        model.preview,
        !draft.chat.trim()
      ),
    ]
  );
};
const GreetingTools = ({ api }) => {
  const t = useT();
  const model = useGreetingSend(api);
  const { availability, busy, error, plan, result, draft } = model.state;
  return el('div', { className: 'col', 'data-telegram-greeting-send': '' }, [
    el('p', { key: 'note', className: 'meta' }, t('telegram.greeting.note')),
    busy ? el(Busy, { key: 'busy' }, t('telegram.greeting.busy')) : null,
    error
      ? el('p', { key: 'error', role: 'alert' }, sendReason(error, t))
      : null,
    availability === 'unavailable'
      ? el(
          'p',
          { key: 'unsupported', role: 'status' },
          t('telegram.greeting.userRequired')
        )
      : null,
    availability === 'ready'
      ? el(GreetingForm, { key: 'form', model, t })
      : null,
    el(GreetingPreview, { key: 'preview', plan, model, t }),
    result
      ? el(
          'p',
          {
            key: 'result',
            role: 'status',
            'data-greeting-send-result': result.status,
          },
          t(
            `telegram.greeting.result.${['sent', 'failed', 'unknown', 'skipped'].includes(result.status) ? result.status : 'failed'}`,
            { id: result.messageId ?? '' }
          )
        )
      : null,
    button('reload', t('telegram.greeting.reload'), model.load, busy),
    el(TelegramGroupGreetings, { key: 'group', api, sticker: draft.sticker }),
    el(TelegramGreetingCatalog, {
      key: 'catalog',
      api,
      selected: draft.sticker,
      onSelect:
        availability === 'ready' && !busy
          ? (sticker) =>
              model.update({ sticker, operation: 'greeting-sticker' })
          : null,
    }),
  ]);
};
export const TelegramGreetingTools = (props) =>
  el(GreetingTools, { ...props, key: activeAccount() });
