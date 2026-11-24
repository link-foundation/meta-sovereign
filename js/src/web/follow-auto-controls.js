import React from 'react';

const el = React.createElement;
const phaseDescription = (phase, t) => {
  const state = `${t(`followTelegram.${phase.phase}`)}: ${t(`followBacklink.${phase.status}`)}`;
  return phase.code && !['confirmed', 'skipped', 'ready'].includes(phase.status)
    ? `${state} · ${t('followBacklink.follow-incomplete')}`
    : state;
};
const previousAttempts = (row, t) =>
  row.attempts?.length
    ? el('details', { key: 'attempts', 'data-follow-auto-attempts': '' }, [
        el(
          'summary',
          { key: 'title' },
          t('followBacklink.previousAttempts', { count: row.attempts.length })
        ),
        el(
          'ul',
          { key: 'rows' },
          row.attempts.map((attempt) =>
            el(
              'li',
              { key: attempt.round },
              `${t('followBacklink.message', { id: attempt.messageId })} · ${t('followBacklink.rejected')}`
            )
          )
        ),
      ])
    : null;
export const automaticReview = (value, t) => {
  if (!value.config.autoFollow) {
    return [];
  }
  const policy = value.config.autoFollow;
  return [
    el(
      'p',
      { key: 'auto-policy', className: 'meta', 'data-follow-auto-policy': '' },
      t('followBacklink.autoPolicy', {
        source: value.config.targetSource === 'telegram' ? 'Telegram' : 'VK',
        owner: value.followingAccount.owner,
        retries: policy.maxRetries,
        messages: value.config.historyLimit,
        links: policy.maxLinks,
      })
    ),
    value.config.targetSource === 'telegram'
      ? el(
          'p',
          { key: 'auto-preferences' },
          t('followBacklink.autoPreferences', {
            mute: t(`followBacklink.${policy.mute ? 'enabled' : 'disabled'}`),
            archive: t(
              `followBacklink.${policy.archive ? 'enabled' : 'disabled'}`
            ),
          })
        )
      : el(
          'p',
          { key: 'auto-vk-preferences' },
          t('followBacklink.autoVkPreferences')
        ),
    ...value.rows.map((row) =>
      el(
        'section',
        { key: `auto:${row.chat}`, 'data-follow-auto-links': row.chat },
        [
          el('strong', { key: 'chat' }, row.title || row.chat),
          previousAttempts(row, t),
          row.following?.limited
            ? el(
                'p',
                { key: 'limited', role: 'status' },
                t('followBacklink.followLimited')
              )
            : null,
          el(
            'ul',
            { key: 'links' },
            (row.following?.links ?? []).map((link) =>
              el('li', { key: link.url, style: { overflowWrap: 'anywhere' } }, [
                el('code', { key: 'url' }, link.url),
                el(
                  'p',
                  { key: 'target' },
                  `${link.review.target.title} · ${link.review.target.chat ?? t('followBacklink.inviteTarget')}`
                ),
                el(
                  'p',
                  { key: 'message' },
                  t('followBacklink.fromMessage', { id: link.messageId })
                ),
                el(
                  'p',
                  { key: 'phases' },
                  (link.result?.results ?? link.review.phases)
                    .map((phase) => phaseDescription(phase, t))
                    .join(' · ')
                ),
              ])
            )
          ),
        ]
      )
    ),
    value.completion
      ? el(
          'p',
          { key: 'auto-completion', role: 'status' },
          t(`followBacklink.${value.completion}`)
        )
      : null,
  ];
};
