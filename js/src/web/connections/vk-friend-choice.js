import React from 'react';
import { useT } from '../i18n.js';
const el = React.createElement;
export const friendMutualLabel = (t, item) =>
  Number.isInteger(item.mutualCount)
    ? ` · ${t('vkFriends.mutualCount', { count: item.mutualCount })}`
    : '';
export const FriendAcceptanceChoice = ({ settings, disabled, save }) => {
  const t = useT();
  return el('label', { className: 'col' }, [
    t('vkFriends.acceptancePolicy'),
    el(
      'select',
      {
        key: 'policy',
        disabled,
        'data-friend-field': 'acceptancePolicy',
        value: settings.acceptancePolicy ?? 'ranked-batch',
        onChange: (event) =>
          save({ ...settings, acceptancePolicy: event.target.value }),
      },
      ['ranked-batch', 'desktop-ten-percent', 'desktop-configured'].map(
        (value) => el('option', { key: value, value }, t(`vkFriends.${value}`))
      )
    ),
    el(
      'span',
      { key: 'hint', className: 'meta' },
      t(
        `vkFriends.${settings.acceptancePolicy === 'desktop-configured' ? 'configuredHint' : 'desktopHint'}`,
        { percent: settings.topPercentMutuals ?? 10 }
      )
    ),
  ]);
};
export const FriendQuotaSummary = ({ quota }) => {
  const t = useT();
  return quota
    ? el('p', { 'data-friend-quota': '' }, t('vkFriends.quotaSummary', quota))
    : null;
};
