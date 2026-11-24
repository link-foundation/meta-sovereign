import React from 'react';
const el = React.createElement;
export const UsersNumber = ({ name, value, set, t, max, min = 0 }) =>
  el('label', { className: 'export-field' }, [
    el('span', { key: 'l' }, t(`chat.users.${name}`)),
    el('input', {
      key: 'i',
      type: 'number',
      min,
      max,
      step: 1,
      value,
      'data-users-field': name,
      onChange: (e) => set(Number(e.target.value)),
    }),
  ]);
export const UsersCheck = ({ name, checked, set, t }) =>
  el('label', { className: 'pin-dialog-option' }, [
    el('input', {
      key: 'i',
      type: 'checkbox',
      checked,
      'data-users-field': name,
      onChange: (e) => set(e.target.checked),
    }),
    el('span', { key: 'l' }, t(`chat.users.${name}`)),
  ]);
export const UsersCoverage = ({ coverage, t }) =>
  el(
    'ul',
    { className: 'chat-users-coverage' },
    Object.entries(coverage ?? {}).map(([kind, item]) =>
      el('li', { key: kind }, [
        `${t(`chat.users.${kind}`)}: ${item.read} · ${t(`chat.users.${item.disabled ? 'disabled' : item.complete ? 'complete' : 'partial'}`)}`,
        item.error ? ` · ${t('chat.users.readDenied')}` : '',
      ])
    )
  );
export const UsersPlan = ({ plan, t }) =>
  el('div', { 'data-users': 'preview', className: 'chat-users-plan' }, [
    el(
      'p',
      { key: 'count' },
      t('chat.users.selected', {
        count: plan.selected,
        eligible: plan.eligible,
      })
    ),
    el(
      'p',
      { key: 'phone' },
      t(plan.options.sharePhone ? 'chat.users.phoneOn' : 'chat.users.phoneOff')
    ),
    el('p', { key: 'expiry', className: 'meta' }, t('chat.users.expiry')),
    el(
      'ul',
      { key: 'skips' },
      Object.entries(plan.skipped).map(([reason, count]) =>
        el('li', { key: reason }, `${t(`chat.users.skip.${reason}`)}: ${count}`)
      )
    ),
  ]);
const userName = (user) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') ||
  user.username ||
  user.id;
export const UsersList = ({ data, t }) =>
  el('div', { className: 'chat-users-list' }, [
    el(
      'ul',
      { key: 'users' },
      (data.users ?? []).map((user) =>
        el('li', { key: user.id }, [
          el('strong', { key: 'name' }, userName(user)),
          el('span', { key: 'id', className: 'meta' }, ` · ${user.id}`),
          el(
            'small',
            { key: 'sources' },
            user.sources
              .map((source) => t(`chat.users.source.${source}`))
              .join(', ')
          ),
        ])
      )
    ),
    el(
      'ul',
      { key: 'results' },
      (data.results ?? []).map((result) =>
        el(
          'li',
          { key: result.id },
          `${result.user} · ${t(`chat.users.result.${result.status}`)}`
        )
      )
    ),
  ]);
export const UsersProgress = ({ job, t }) =>
  el('div', { role: 'status', 'data-users': 'progress' }, [
    el('p', { key: 'state' }, t(`chat.users.state.${job.state}`)),
    el(
      'p',
      { key: 'count' },
      job.kind === 'scan'
        ? t('chat.users.found', { count: job.users })
        : t('chat.users.processed', { count: job.processed, total: job.total })
    ),
    job.retryAfter
      ? el(
          'p',
          { key: 'wait' },
          t('chat.users.wait', { seconds: job.retryAfter })
        )
      : null,
    el(
      'ul',
      { key: 'counts' },
      Object.entries(job.counts).map(([status, count]) =>
        el(
          'li',
          { key: status },
          `${t(`chat.users.result.${status}`)}: ${count}`
        )
      )
    ),
    job.code
      ? el('p', { key: 'error', role: 'alert' }, t('chat.users.jobFailed'))
      : null,
    job.unresolvedMentions > 0
      ? el(
          'p',
          { key: 'mentions' },
          t('chat.users.unresolvedMentions', { count: job.unresolvedMentions })
        )
      : null,
  ]);
