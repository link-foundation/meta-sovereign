import React, { useEffect, useMemo, useState } from 'react';
import { useT, useDates } from './i18n.js';
import { Busy } from './spinner.js';
import { UsersCoverage } from './chat-users-content.js';
import { createGroupGreetingModel } from './telegram-group-greeting-model.js';

const el = React.createElement;
const button = (name, label, use, disabled = false) =>
  el(
    'button',
    {
      key: name,
      type: 'button',
      'data-group-greeting-action': name,
      onClick: use,
      disabled,
    },
    label
  );
const useGroupGreetings = (api) => {
  const [, render] = useState(0);
  const model = useMemo(
    () => createGroupGreetingModel(api, () => render((value) => value + 1)),
    [api]
  );
  useEffect(() => {
    model.start();
    const timer = globalThis.setInterval(model.poll, 1500);
    return () => {
      globalThis.clearInterval(timer);
      model.stop();
    };
  }, [model]);
  return model;
};
const reason = (code, t) => {
  const key = `telegram.group.reason.${code}`;
  const translated = t(key);
  if (translated !== key) {
    return translated;
  }
  const shared = t(`chat.users.skip.${code}`);
  return shared === `chat.users.skip.${code}`
    ? t('telegram.group.unavailable')
    : shared;
};
const number = (name, max, model, t) =>
  el('label', { key: name, className: 'export-field' }, [
    el('span', { key: 'label' }, t(`telegram.group.${name}`)),
    el('input', {
      key: 'input',
      type: 'number',
      min: 0,
      max,
      step: 1,
      value: model.state.draft[name],
      'data-group-greeting-field': name,
      onChange: (event) => model.update({ [name]: Number(event.target.value) }),
    }),
  ]);
const valid = (draft) =>
  draft.chat.trim() &&
  Object.entries({
    participantsLimit: 1_000_000,
    limit: 100_000,
    delayMs: 3_600_000,
  }).every(
    ([key, max]) =>
      Number.isInteger(draft[key]) && draft[key] >= 0 && draft[key] <= max
  );
const GroupPlan = ({ model, t }) => {
  const dates = useDates();
  const plan = model.state.plan;
  return plan
    ? el('div', { className: 'card col', 'data-group-greeting-preview': '' }, [
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
          { key: 'selected' },
          t('chat.users.selected', {
            count: plan.selected,
            eligible: plan.eligible,
          })
        ),
        el(
          'p',
          { key: 'delay' },
          t('telegram.group.planDelay', {
            seconds: plan.options.delayMs / 1000,
          })
        ),
        el(
          'p',
          { key: 'expires', className: 'meta' },
          t('telegram.greeting.expires', { at: dates.dateTime(plan.expiresAt) })
        ),
        el(
          'ul',
          { key: 'excluded' },
          Object.entries(plan.skipped).map(([code, count]) =>
            el('li', { key: code }, `${reason(code, t)}: ${count}`)
          )
        ),
        el(
          'ol',
          { key: 'sample' },
          plan.sample.map((user) =>
            el(
              'li',
              { key: user.id },
              `${user.firstName || user.username || user.id} (${user.id}) · ${user.sticker.emoji || '👋'} ${user.sticker.id}`
            )
          )
        ),
        plan.selected > plan.sample.length
          ? el(
              'p',
              { key: 'sample-note', className: 'meta' },
              t('telegram.group.sample')
            )
          : null,
        button(
          'apply',
          t('telegram.group.apply', { count: plan.selected }),
          model.apply,
          model.state.busy || !plan.selected
        ),
      ])
    : null;
};
const GroupJobContent = ({ job, data, t }) => {
  const dates = useDates();
  const active = ['running', 'cancelling'].includes(job.state);
  return el(React.Fragment, null, [
    el('p', { key: 'state' }, t(`chat.users.state.${job.state}`)),
    el('p', { key: 'chat' }, job.title || job.chat),
    el(
      'p',
      { key: 'count' },
      job.kind === 'scan'
        ? t('chat.users.found', { count: job.users })
        : t('telegram.group.processed', {
            count: job.processed,
            total: job.total,
          })
    ),
    active && job.phase === 'checking-business'
      ? el('p', { key: 'business' }, t('telegram.group.checkingBusiness'))
      : null,
    active && job.nextAt
      ? el(
          'p',
          { key: 'wait' },
          t('telegram.group.nextAt', { at: dates.dateTime(job.nextAt) })
        )
      : null,
    el(UsersCoverage, { key: 'coverage', coverage: job.coverage, t }),
    el(
      'ul',
      { key: 'counts' },
      Object.entries(job.counts).map(([status, count]) =>
        el(
          'li',
          { key: status },
          `${t(`telegram.group.result.${status}`)}: ${count}`
        )
      )
    ),
    job.stopped || job.code
      ? el(
          'p',
          { key: 'stopped', role: 'alert' },
          `${t('telegram.group.stopped')} ${reason(job.stopped || job.code, t)}`
        )
      : null,
    el(
      'ul',
      { key: 'results' },
      (data.results ?? []).map((item) =>
        el(
          'li',
          { key: item.id },
          `${item.user} · ${t(`telegram.group.result.${item.status}`)}${item.messageId ? ` · ${item.messageId}` : ''}`
        )
      )
    ),
  ]);
};
const GroupProgress = ({ model, t }) => {
  const { data } = model.state;
  const job = data?.job;
  if (!job) {
    return null;
  }
  return el(
    'div',
    {
      className: 'col',
      'data-group-greeting-progress': job.state,
      'data-group-greeting-job': job.id,
      'data-group-greeting-kind': job.kind,
      role: 'status',
    },
    [
      job.kind === 'greetings' || job.options?.greetingGroup
        ? el(GroupJobContent, { key: 'content', job, data, t })
        : el('p', { key: 'other' }, t('chat.users.other')),
      model.running()
        ? button(
            'cancel',
            t('chat.users.cancel'),
            model.cancel,
            model.state.busy || job.state === 'cancelling'
          )
        : null,
    ]
  );
};
export const TelegramGroupGreetings = ({ api, sticker = null }) => {
  const t = useT();
  const model = useGroupGreetings(api);
  const { availability, busy, draft, error, uncertain } = model.state;
  useEffect(() => {
    if (!busy && model.state.draft.sticker !== sticker) {
      model.update({ sticker });
    }
  }, [sticker, busy, model]);
  return el(
    'details',
    { className: 'card col', 'data-telegram-group-greetings': '' },
    [
      el('summary', { key: 'summary' }, t('telegram.group.title')),
      el('p', { key: 'note', className: 'meta' }, t('telegram.group.note')),
      busy ? el(Busy, { key: 'busy' }, t('telegram.greeting.busy')) : null,
      availability === 'unavailable'
        ? el(
            'p',
            { key: 'unsupported', role: 'status' },
            t('telegram.greeting.userRequired')
          )
        : null,
      error ? el('p', { key: 'error', role: 'alert' }, reason(error, t)) : null,
      uncertain
        ? el(
            'p',
            { key: 'unknown', role: 'alert' },
            t('telegram.group.uncertain')
          )
        : null,
      availability === 'ready'
        ? el(
            'fieldset',
            {
              key: 'form',
              disabled: busy || model.running(),
              className: 'telegram-greeting-send-form',
            },
            [
              el('legend', { key: 'legend' }, t('telegram.group.title')),
              el('label', { key: 'chat', className: 'export-field' }, [
                el('span', { key: 'label' }, t('telegram.group.target')),
                el('input', {
                  key: 'input',
                  value: draft.chat,
                  'data-group-greeting-field': 'chat',
                  onChange: (event) =>
                    model.update({ chat: event.target.value }),
                }),
              ]),
              ...Object.entries({
                participantsLimit: 1_000_000,
                limit: 100_000,
                delayMs: 3_600_000,
              }).map(([key, max]) => number(key, max, model, t)),
              el(
                'p',
                { key: 'sticker' },
                draft.sticker
                  ? t('telegram.greeting.chosen', { sticker: draft.sticker })
                  : t('telegram.greeting.random')
              ),
              button(
                'scan',
                t('telegram.group.scan'),
                model.scan,
                !valid(draft)
              ),
              button(
                'preview',
                t('telegram.group.preview'),
                model.preview,
                !model.ownScan() || !valid(draft)
              ),
            ]
          )
        : null,
      availability === 'ready'
        ? el(GroupPlan, { key: 'plan', model, t })
        : null,
      availability === 'ready'
        ? el(GroupProgress, { key: 'progress', model, t })
        : null,
      button('reload', t('telegram.greeting.reload'), model.load, busy),
    ]
  );
};
