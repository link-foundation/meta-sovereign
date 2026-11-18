import React from 'react';
import { FollowReadControls } from './follow-read-controls.js';
import { useT } from './i18n.js';
import { useFollowTelegram } from './follow-telegram-state.js';

const el = React.createElement;
const field = (name, control, t) =>
  el('label', { key: name, className: 'field' }, [
    el(
      'span',
      { key: 'l', className: 'field-label' },
      t(`followTelegram.${name}`)
    ),
    control,
  ]);
const button = (name, state, t, input, disabled = false) =>
  el(
    'button',
    {
      key: name,
      type: 'button',
      disabled: state.busy || disabled,
      'data-follow-telegram-action': name,
      onClick: () => state.perform(name === 'next' ? 'list' : name, input),
    },
    t(`followTelegram.${name}`)
  );
const choice = (name, choices, state, t) =>
  field(
    name,
    el(
      'select',
      {
        key: 'c',
        value: state.form[name],
        disabled:
          state.busy ||
          (state.form.operation === 'leave' && name !== 'operation'),
        'data-follow-telegram-field': name,
        onChange: (e) => state.change(name, e.target.value),
      },
      choices.map(([value, label]) =>
        el('option', { key: value, value }, t(`followTelegram.${label}`))
      )
    ),
    t
  );
const valueText = (value, t) =>
  t(`followTelegram.${value === null ? 'valueUnknown' : value ? 'yes' : 'no'}`);
const targetInfo = (target, t) =>
  el(
    'div',
    { key: 'target', className: 'col', style: { overflowWrap: 'anywhere' } },
    [
      el('strong', { key: 't' }, target.title || t('followTelegram.untitled')),
      el('code', { key: 'id' }, target.chat ?? t('followTelegram.idAfterJoin')),
      el(
        'span',
        { key: 'm', className: 'meta' },
        t('followTelegram.state', {
          member: valueText(target.member, t),
          muted: valueText(target.muted, t),
          archived: valueText(target.archived, t),
        })
      ),
    ]
  );
const statusText = (code, t) => {
  const key = `followTelegram.${code}`;
  return t(key) === key ? t('followTelegram.failed') : t(key);
};
const Plan = ({ state, t }) => {
  const plan = state.plan;
  if (!plan) {
    return null;
  }
  return el(
    'article',
    { className: 'card col', 'data-follow-telegram-plan': plan.planId },
    [
      el('h3', { key: 'h' }, t('followTelegram.review')),
      el('p', { key: 'o' }, t('followTelegram.owner', { owner: plan.owner })),
      targetInfo(plan.target, t),
      el('p', { key: 'op' }, t(`followTelegram.${plan.operation}`)),
      plan.operation === 'leave'
        ? el(
            'p',
            { key: 'leave', className: 'meta' },
            t('followTelegram.leaveHint')
          )
        : el(
            'p',
            { key: 'options' },
            t('followTelegram.options', {
              mute:
                plan.options.mute === null
                  ? t('followTelegram.unchanged')
                  : valueText(plan.options.mute, t),
              archive:
                plan.options.archive === null
                  ? t('followTelegram.unchanged')
                  : valueText(plan.options.archive, t),
            })
          ),
      el(
        'p',
        { key: 'retry', className: 'meta' },
        t('followRead.summary', {
          attempts: plan.retry?.attempts ?? 3,
          delay: plan.retry?.delayMs ?? 100,
          max: plan.retry?.maxDelayMs ?? 2000,
        })
      ),
      plan.target.requestNeeded
        ? el('p', { key: 'request' }, t('followTelegram.approvalHint'))
        : null,
      el(
        'ul',
        { key: 'phases' },
        plan.phases.map((row) =>
          el(
            'li',
            { key: row.phase },
            `${t(`followTelegram.${row.phase}`)}: ${statusText(row.status, t)}`
          )
        )
      ),
      el(
        'div',
        { key: 'buttons', className: 'row', style: { flexWrap: 'wrap' } },
        [
          button(
            'apply',
            state,
            t,
            undefined,
            !plan.phases.length ||
              plan.phases.some(
                (row) => !['ready', 'skipped'].includes(row.status)
              )
          ),
          button('cancel', state, t),
        ]
      ),
    ]
  );
};
const Results = ({ result, t }) =>
  result
    ? el(
        'div',
        { role: 'status', className: 'col', 'data-follow-telegram-result': '' },
        [
          el(
            'strong',
            { key: 'h' },
            t(
              result.ok
                ? 'followTelegram.confirmed'
                : 'followTelegram.checkResult'
            )
          ),
          result.chat ? el('code', { key: 'chat' }, result.chat) : null,
          ...(result.results ?? []).map((row) =>
            el(
              'p',
              { key: row.phase },
              `${t(`followTelegram.${row.phase}`)}: ${statusText(row.status, t)}${row.code ? ` · ${statusText(row.code, t)}` : ''}`
            )
          ),
          result.code
            ? el('p', { key: 'e' }, statusText(result.code, t))
            : null,
        ]
      )
    : null;
export const FollowTelegramControls = ({ api }) => {
  const t = useT();
  const state = useFollowTelegram(api);
  return el('details', { className: 'card col', 'data-follow-telegram': '' }, [
    el('summary', { key: 's' }, t('followTelegram.title')),
    el('p', { key: 'hint', className: 'meta' }, t('followTelegram.hint')),
    el(FollowReadControls, {
      key: 'retry',
      form: state.form,
      change: state.change,
      busy: state.busy,
      t,
    }),
    el(
      'fieldset',
      {
        key: 'list',
        disabled: state.busy,
        className: 'automation-fieldset col',
      },
      [
        el('legend', { key: 'l' }, t('followTelegram.groups')),
        field(
          'limit',
          el('input', {
            key: 'c',
            type: 'number',
            min: 1,
            max: 100,
            value: state.form.limit,
            onChange: (e) => state.change('limit', e.target.value),
          }),
          t
        ),
        el('div', { key: 'b', className: 'row', style: { flexWrap: 'wrap' } }, [
          button('list', state, t),
          state.page?.page.next
            ? button('next', state, t, { cursor: state.page.page.next })
            : null,
        ]),
        state.page
          ? el(
              'p',
              { key: 'page', className: 'meta' },
              t('followTelegram.page', { count: state.page.page.scanned })
            )
          : null,
        state.page?.page.partial
          ? el('p', { key: 'partial' }, t('followTelegram.partial'))
          : null,
        ...(state.page?.chats ?? []).map((chat) =>
          el(
            'article',
            {
              key: chat.chat,
              className: 'card col',
              'data-follow-telegram-chat': chat.chat,
            },
            [
              targetInfo(chat, t),
              el(
                'button',
                {
                  key: 'choose',
                  type: 'button',
                  onClick: () => state.change('target', chat.chat),
                },
                t('followTelegram.choose')
              ),
            ]
          )
        ),
      ]
    ),
    el(
      'fieldset',
      {
        key: 'target',
        disabled: state.busy,
        className: 'automation-fieldset col',
      },
      [
        el('legend', { key: 'l' }, t('followTelegram.review')),
        field(
          'target',
          el('input', {
            key: 'c',
            value: state.form.target,
            'data-follow-telegram-field': 'target',
            onChange: (e) => state.change('target', e.target.value),
            autoComplete: 'off',
          }),
          t
        ),
        choice(
          'operation',
          [
            ['join', 'join'],
            ['leave', 'leave'],
            ['preferences', 'preferences'],
          ],
          state,
          t
        ),
        choice(
          'mute',
          [
            ['', 'unchanged'],
            ['true', 'muteOn'],
            ['false', 'muteOff'],
          ],
          state,
          t
        ),
        choice(
          'archive',
          [
            ['', 'unchanged'],
            ['true', 'archiveOn'],
            ['false', 'archiveOff'],
          ],
          state,
          t
        ),
        button('preview', state, t, undefined, !state.form.target.trim()),
      ]
    ),
    state.busy
      ? el('p', { key: 'busy', role: 'status' }, t('followTelegram.working'))
      : null,
    state.busy
      ? el(
          'button',
          {
            key: 'stop',
            type: 'button',
            'data-follow-telegram-action': 'stop',
            onClick: state.stop,
          },
          t('followTelegram.stop')
        )
      : null,
    state.error
      ? el('p', { key: 'error', role: 'alert' }, statusText(state.error, t))
      : null,
    el(Plan, { key: 'plan', state, t }),
    el(Results, { key: 'result', result: state.result, t }),
  ]);
};
